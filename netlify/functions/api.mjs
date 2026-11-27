import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Guide, Preset, Feedback, Admin } from '../../server/models.js';
import dns from 'node:dns';
import tls from 'node:tls';

/*
 * Netlify-compatible API handler for the routes the browser already uses.
 * Database credentials are read from Netlify environment variables only.
 * No secret is ever included in the deployed bundle or source repository.
 */

// Atlas hosts can resolve to NAT64 IPv6 addresses first in some Node runtimes.
// Force IPv4 so MongoDB TLS handshakes succeed with the replica set hosts.
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// Some Atlas deployments reject TLS 1.3 client hellos from serverless runtimes.
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
tls.DEFAULT_MAX_VERSION = 'TLSv1.2';

const PLACEHOLDER_SECRETS = new Set([
  'secret', 'changeme', 'change-me', 'your-jwt-secret',
  'replace-this-with-a-long-random-secret-at-least-32-characters',
  'local-development-secret-change-before-deploy-123456',
  'local-development-secret-change-before-deploy-1234567890'
]);
const loginAttempts = new Map();
const apiAttempts = new Map();
let dbPromise;

function atlasUri() {
  const uri = process.env.MONGODB_URI || '';
  if (!uri.startsWith('mongodb://')) return uri;
  const match = uri.match(/^mongodb:\/\/([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return uri;
  const [, credentials, hosts, db = '/krixo'] = match;
  const domain = hosts.split(',')[0].split(':')[0].split('.').slice(1).join('.');
  if (!domain) return uri;
  const database = db === '/' ? '/krixo' : db;
  return `mongodb+srv://${credentials}@cluster0.${domain}${database}?authSource=admin`;
}

function jwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret.length < 32 || PLACEHOLDER_SECRETS.has(secret) || /^(replace-this-with|local-development-secret-change-before-deploy)/i.test(secret)) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return secret;
}

async function connectDb() {
  if (!process.env.MONGODB_URI) return false;
  if (!dbPromise) {
    dbPromise = mongoose.connect(atlasUri(), { family: 4, serverSelectionTimeoutMS: 8000 })
      .then(() => true)
      .catch(error => {
        console.error('MongoDB connection failed:', error.message);
        dbPromise = undefined;
        return false;
      });
  }
  return dbPromise;
}

function header(event, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (key.toLowerCase() === wanted) return value;
  }
  return '';
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function bodyOf(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function cookieValue(event, name) {
  const raw = header(event, 'cookie');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function routeOf(event) {
  const raw = event.rawUrl || event.path || '';
  let path = raw.split('?')[0];
  const marker = path.indexOf('/api/');
  if (marker !== -1) path = path.slice(marker + 4);
  else path = path.replace(/^\/\.netlify\/functions\/api/, '') || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return path.replace(/\/+$/, '') || '/';
}

function cleanString(value, max = 3000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeSlug(value) {
  return cleanString(value, 140).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function isTrue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}

function hasField(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

async function adminFromEvent(event) {
  const token = cookieValue(event, 'krixo_admin');
  if (!token) return { admin: null, error: null };
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    if (!payload || payload.role !== 'admin' || !payload.sub) return { admin: null, error: 'Your session is not authorized.' };
  } catch {
    return { admin: null, error: 'Your session expired. Please sign in again.' };
  }
  /* A signed token is not enough: recheck the admin record so revoked or
     demoted accounts lose access before the token expires. */
  try {
    const record = await Admin.findById(payload.sub).select('email role').lean();
    if (!record || record.role !== 'admin') return { admin: null, error: 'Your session is no longer authorized.' };
    return { admin: { id: payload.sub, email: record.email, role: record.role }, error: null };
  } catch {
    return { admin: null, error: 'We could not verify your session. Please sign in again.' };
  }
}

function clientIp(event) {
  return header(event, 'x-nf-client-connection-ip') || header(event, 'x-forwarded-for').split(',')[0].trim() || 'unknown';
}

function tooManyLogins(event) {
  const key = clientIp(event);
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  if (recent.length >= 8) {
    loginAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  return false;
}

function tooManyApiRequests(event, path) {
  if (path === '/health') return false;
  const key = clientIp(event);
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const recent = (apiAttempts.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= 120) {
    apiAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  apiAttempts.set(key, recent);
  if (apiAttempts.size > 2000) {
    for (const [storedKey, times] of apiAttempts) {
      if (!times.some(t => now - t < windowMs)) apiAttempts.delete(storedKey);
    }
  }
  return false;
}

function requestBodySize(event) {
  if (!event.body) return 0;
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').length : Buffer.byteLength(event.body, 'utf8');
}

function cookieHeader(token) {
  return `krixo_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`;
}

function clearCookieHeader() {
  return 'krixo_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

async function adminRoutes(event, method, path, body) {
  if (path === '/admin/login' && method === 'POST') {
    if (tooManyLogins(event)) return json(429, { error: 'Too many login attempts. Try again in 15 minutes.' });
    let secret;
    try { secret = jwtSecret(); } catch { return json(503, { error: 'Admin sign-in is not configured on this site.' }); }
    const email = cleanString(body.email, 180).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return json(401, { error: 'Email or password is incorrect.' });
    const token = jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, secret, { expiresIn: '8h' });
    return json(200, { ok: true, email: admin.email }, { 'set-cookie': cookieHeader(token) });
  }

  if (path === '/admin/logout' && method === 'POST') {
    return json(200, { ok: true }, { 'set-cookie': clearCookieHeader() });
  }

  if (path === '/admin/me' && method === 'GET' && !cookieValue(event, 'krixo_admin')) {
    return json(200, { admin: null });
  }

  const { admin, error } = await adminFromEvent(event);
  if (!admin) return json(401, { error: error || 'Please sign in.' });

  if (path === '/admin/me' && method === 'GET') return json(200, { admin });

  if (path === '/admin/summary' && method === 'GET') {
    const [guides, presets, newFeedback] = await Promise.all([
      Guide.countDocuments(), Preset.countDocuments(), Feedback.countDocuments({ status: 'new' })
    ]);
    return json(200, { guides, presets, newFeedback });
  }

  if (path === '/admin/guides' && method === 'GET') {
    return json(200, { guides: await Guide.find().sort({ updatedAt: -1 }).lean() });
  }

  if (path === '/admin/guides' && method === 'POST') {
    const title = cleanString(body.title, 140);
    const slug = safeSlug(body.slug || title);
    const excerpt = cleanString(body.excerpt, 320);
    const guideBody = cleanString(body.body, 30000);
    if (!title || !slug || !excerpt || !guideBody) {
      return json(400, { error: 'Title, slug, short description and guide text are required.' });
    }
    try {
      const guide = await Guide.create({
        title, slug, excerpt, body: guideBody,
        category: cleanString(body.category, 50) || 'Guides',
        published: isTrue(body.published),
        seoTitle: cleanString(body.seoTitle, 160),
        seoDescription: cleanString(body.seoDescription, 320)
      });
      return json(201, { guide });
    } catch (createError) {
      return json(400, { error: createError.code === 11000 ? 'That slug already exists.' : 'Could not save this guide.' });
    }
  }

  const guideId = path.match(/^\/admin\/guides\/([^/]+)$/);
  if (guideId) {
    if (!mongoose.isValidObjectId(guideId[1])) return json(400, { error: 'Invalid guide id.' });
    if (method === 'PUT') {
      const update = {};
      if (hasField(body, 'title')) update.title = cleanString(body.title, 140);
      if (hasField(body, 'slug')) update.slug = safeSlug(body.slug);
      if (hasField(body, 'excerpt')) update.excerpt = cleanString(body.excerpt, 320);
      if (hasField(body, 'body')) update.body = cleanString(body.body, 30000).replace(/\r\n?/g, '\n');
      if (hasField(body, 'category')) update.category = cleanString(body.category, 50) || 'Guides';
      if (hasField(body, 'published')) update.published = isTrue(body.published);
      if (hasField(body, 'seoTitle')) update.seoTitle = cleanString(body.seoTitle, 160);
      if (hasField(body, 'seoDescription')) update.seoDescription = cleanString(body.seoDescription, 320);
      if (!Object.keys(update).length) return json(400, { error: 'No guide fields were provided.' });
      try {
        const guide = await Guide.findByIdAndUpdate(guideId[1], update, { new: true, runValidators: true });
        if (!guide) return json(404, { error: 'Guide not found.' });
        return json(200, { guide });
      } catch (updateError) {
        return json(400, { error: updateError.code === 11000 ? 'That slug already exists.' : 'Could not update this guide.' });
      }
    }
    if (method === 'DELETE') {
      const guide = await Guide.findByIdAndDelete(guideId[1]);
      if (!guide) return json(404, { error: 'Guide not found.' });
      return json(200, { ok: true });
    }
  }

  if (path === '/admin/presets' && method === 'GET') {
    return json(200, { presets: await Preset.find().sort({ category: 1, name: 1 }).lean() });
  }

  if (path === '/admin/presets' && method === 'POST') {
    const name = cleanString(body.name, 100);
    const sourceUrl = cleanString(body.sourceUrl, 1000);
    const maxKB = Number(body.maxKB);
    if (!name || !Number.isFinite(maxKB) || maxKB <= 0) {
      return json(400, { error: 'Preset name and a valid maximum KB are required.' });
    }
    const optionalNumber = (value, min) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min ? parsed : null;
    };
    const width = optionalNumber(body.width, 1);
    const height = optionalNumber(body.height, 1);
    const minKB = optionalNumber(body.minKB, 0);
    if (width === null || height === null || minKB === null) {
      return json(400, { error: 'Width and height must be positive numbers; minimum KB must be a number (0 is allowed).' });
    }
    if (minKB !== undefined && minKB > maxKB) return json(400, { error: 'Minimum KB cannot be greater than maximum KB.' });
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) return json(400, { error: 'Reference URL must start with https://.' });
    const checkedAt = body.checkedAt ? new Date(body.checkedAt) : undefined;
    if (checkedAt && Number.isNaN(checkedAt.getTime())) return json(400, { error: 'Checked date is not a valid date.' });
    const published = isTrue(body.published);
    if (published && (!sourceUrl || !checkedAt)) {
      return json(400, { error: 'A published preset must include an official https source URL and a checked date.' });
    }
    try {
      const preset = await Preset.create({
        name,
        category: ['photo', 'signature', 'thumb', 'document'].includes(body.category) ? body.category : 'photo',
        width, height, minKB, maxKB,
        format: ['jpg', 'png', 'webp', 'pdf'].includes(body.format) ? body.format : 'jpg',
        notes: cleanString(body.notes, 500), sourceUrl, checkedAt, published
      });
      return json(201, { preset });
    } catch {
      return json(400, { error: 'Could not save this preset. Check the preset values and try again.' });
    }
  }

  const presetId = path.match(/^\/admin\/presets\/([^/]+)$/);
  if (presetId && method === 'DELETE') {
    if (!mongoose.isValidObjectId(presetId[1])) return json(400, { error: 'Invalid preset id.' });
    const preset = await Preset.findByIdAndDelete(presetId[1]);
    if (!preset) return json(404, { error: 'Preset not found.' });
    return json(200, { ok: true });
  }

  if (path === '/admin/feedback' && method === 'GET') {
    return json(200, { feedback: await Feedback.find().sort({ createdAt: -1 }).limit(200).lean() });
  }

  const feedbackId = path.match(/^\/admin\/feedback\/([^/]+)$/);
  if (feedbackId && method === 'PATCH') {
    if (!mongoose.isValidObjectId(feedbackId[1])) return json(400, { error: 'Invalid feedback id.' });
    const status = body.status;
    if (typeof status !== 'string' || !['new', 'reviewed', 'closed'].includes(status)) {
      return json(400, { error: 'Status must be new, reviewed or closed.' });
    }
    const item = await Feedback.findByIdAndUpdate(feedbackId[1], { status }, { new: true, runValidators: true });
    if (!item) return json(404, { error: 'Feedback not found.' });
    return json(200, { feedback: item });
  }

  return json(404, { error: 'API route not found.' });
}

export async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const path = routeOf(event);
  if (tooManyApiRequests(event, path)) {
    return json(429, { error: 'Too many requests. Please wait a few minutes and try again.' });
  }
  if (requestBodySize(event) > 200 * 1024) {
    return json(413, { error: 'That request is too large. Please send a shorter message.' });
  }
  const body = bodyOf(event);

  try {
    if (path === '/health' && method === 'GET') {
      if (!process.env.MONGODB_URI) {
        return json(200, { ok: true, service: 'KriXo API', database: 'not-configured', fileProcessing: 'browser-only' });
      }
      const connected = await connectDb();
      return connected
        ? json(200, { ok: true, service: 'KriXo API', database: 'connected', fileProcessing: 'browser-only' })
        : json(503, { ok: false, service: 'KriXo API', database: 'unavailable', fileProcessing: 'browser-only' });
    }

    /* Anonymous session checks and logout must work even when the CMS is unconfigured. */
    if (path === '/admin/me' && method === 'GET' && !cookieValue(event, 'krixo_admin')) {
      return json(200, { admin: null });
    }
    if (path === '/admin/logout' && method === 'POST') {
      return json(200, { ok: true }, { 'set-cookie': clearCookieHeader() });
    }

    if (!await connectDb()) {
      return json(503, { error: 'This section is not available on this site right now.' });
    }

    if (path === '/guides' && method === 'GET') {
      const guides = await Guide.find({ published: true })
        .select('title slug excerpt category seoTitle seoDescription createdAt updatedAt')
        .sort({ updatedAt: -1 }).lean();
      return json(200, { guides });
    }

    const guideSlug = path.match(/^\/guides\/([^/]+)$/);
    if (guideSlug && method === 'GET') {
      const guide = await Guide.findOne({ slug: safeSlug(guideSlug[1]), published: true }).select('-__v').lean();
      if (!guide) return json(404, { error: 'Guide not found.' });
      return json(200, { guide });
    }

    if (path === '/presets' && method === 'GET') {
      const presets = await Preset.find({ published: true }).select('-__v -sourceUrl').sort({ category: 1, name: 1 }).lean();
      return json(200, { presets });
    }

    if (path === '/feedback' && method === 'POST') {
      const message = cleanString(body.message, 3000);
      if (message.length < 8) return json(400, { error: 'Please write at least 8 characters.' });
      const rawEmail = cleanString(body.email, 180);
      if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return json(400, { error: 'Enter a valid email address or leave it blank.' });
      }
      const feedback = await Feedback.create({
        name: cleanString(body.name, 100),
        email: rawEmail || undefined,
        type: ['bug', 'idea', 'other'].includes(body.type) ? body.type : 'other',
        message
      });
      return json(201, { ok: true, id: feedback.id, message: 'Thanks — your feedback has been received.' });
    }

    if (path.startsWith('/admin')) return adminRoutes(event, method, path, body);

    return json(404, { error: 'API route not found.' });
  } catch (error) {
    console.error('API handler error:', error.message);
    return json(500, { error: 'Something went wrong on the server. Please try again.' });
  }
}
