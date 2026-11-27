import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import tls from 'node:tls';
import { Guide, Preset, Feedback, Admin } from './server/models.js';

// Prefer IPv4 for Atlas replica set hosts; NAT64 IPv6 records can break TLS.
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
tls.DEFAULT_MAX_VERSION = 'TLSv1.2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
// Anything other than explicit local development is treated as production-like.
const isProd = process.env.NODE_ENV !== 'development';
const PLACEHOLDER_JWT_SECRETS = new Set([
  'secret', 'changeme', 'change-me', 'your-jwt-secret',
  'replace-this-with-a-long-random-secret-at-least-32-characters',
  'local-development-secret-change-before-deploy-123456',
  'local-development-secret-change-before-deploy-1234567890'
]);
function resolveJwtSecret() {
  const configured = (process.env.JWT_SECRET || '').trim();
  const isPlaceholder = PLACEHOLDER_JWT_SECRETS.has(configured) || /^(replace-this-with|local-development-secret-change-before-deploy)/i.test(configured);
  if (!configured || configured.length < 32 || isPlaceholder) {
    if (isProd) throw new Error('JWT_SECRET must be at least 32 characters and must not be a placeholder.');
    console.warn('WARNING: JWT_SECRET is missing, too short or a placeholder. Generating an ephemeral secret for local development; existing sessions will be invalid.');
    return randomBytes(32).toString('hex');
  }
  return configured;
}
const JWT_SECRET = resolveJwtSecret();
let dbReady = false;

app.disable('x-powered-by');
// Enable X-Forwarded-* handling only when explicitly running behind a trusted proxy.
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: 'draft-7', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', apiLimiter);

const distDir = path.join(__dirname, 'dist');
// Prefer the built app whenever it exists so this server can serve a fully working
// site on its own port. Vite proxies only API and metadata routes, so hashed assets
// keep loading from the Vite dev server at 5173 during development.
// Source files are used as a fallback before the first build.
const publicDir = existsSync(path.join(distDir, 'index.html')) ? distDir : path.join(__dirname, 'public');
console.log(`Serving static files from ${path.relative(__dirname, publicDir) || '.'}`);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Prefer the configured production origin. When it is not set, derive it from the
// request so deployments never ship localhost URLs in canonicals, sitemap or robots.
function publicBase(req) {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedProto = app.get('trust proxy') ? String(req.get('x-forwarded-proto') || '').split(',')[0].trim() : '';
  const protocol = forwardedProto || req.protocol;
  const host = String(req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`).replace(/[\r\n]/g, '');
  return `${protocol}://${host}`;
}
/* CMS guide HTML is generated here, so it must reference the built hashed bundles. */
function builtAsset(prefix, extension, fallback) {
  const dir = path.join(distDir, 'assets');
  if (!existsSync(dir)) return fallback;
  const match = readdirSync(dir).find(name => name.startsWith(prefix) && name.endsWith(extension));
  return match ? `/assets/${match}` : fallback;
}
app.get('/guides/:slug', async (req, res, next) => {
  if (req.params.slug.endsWith('.html') || !dbReady) return next();
  const guide = await Guide.findOne({ slug: safeSlug(req.params.slug), published: true }).lean();
  if (!guide) {
    // Static guide pages must not be shadowed by this dynamic route: let express.static serve them.
    const staticSlug = path.basename(req.params.slug);
    if (/^[A-Za-z0-9_-]+$/.test(staticSlug) && existsSync(path.join(publicDir, 'guides', `${staticSlug}.html`))) return next();
    return res.status(404).send('Guide not found.');
  }
  const appUrl = publicBase(req);
  const title = escapeHtml(guide.seoTitle || `${guide.title} | KriXo`);
  const description = escapeHtml(guide.seoDescription || guide.excerpt);
  // NOTE: public/assets/main.js should use the same CRLF normalization when it splits guide bodies:
  // String(body).replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const body = String(guide.body || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replaceAll('\n','<br>')}</p>`).join('');
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${escapeHtml(appUrl)}/guides/${encodeURIComponent(guide.slug)}"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"><link rel="apple-touch-icon" href="/favicon-180x180.png"><link rel="manifest" href="/site.webmanifest"><link rel="alternate icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="${builtAsset('main-', '.css', '/assets/styles.css')}"><script type="module" src="${builtAsset('main-', '.js', '/assets/main.js')}"></script></head><body><header id="site-header"></header><main class="shell"><section class="page-hero"><div class="breadcrumb"><a href="/">Home</a> / <a href="/guides/">Guides</a></div><h1>${escapeHtml(guide.title)}</h1><p>${escapeHtml(guide.excerpt)}</p></section><article class="content-panel">${body}</article></main><footer id="site-footer"></footer></body></html>`);
});
const staticSitemapPaths = [
  '',
  'tools/add-page-numbers.html', 'tools/crop-pdf.html', 'tools/delete-pdf-pages.html',
  'tools/edit-pdf.html', 'tools/excel-to-pdf.html', 'tools/extract-pdf-pages.html',
  'tools/file-checker.html', 'tools/html-to-pdf.html', 'tools/image-compressor.html',
  'tools/image-converter.html', 'tools/image-resizer.html', 'tools/jpg-to-pdf.html',
  'tools/merge-pdf.html', 'tools/ocr-pdf.html', 'tools/organize-pdf.html',
  'tools/pdf-compressor.html', 'tools/pdf-to-excel.html', 'tools/pdf-to-jpg.html',
  'tools/pdf-to-pdfa.html', 'tools/pdf-to-pptx.html', 'tools/pdf-to-word.html',
  'tools/photo-signature-resizer.html', 'tools/pptx-to-pdf.html', 'tools/protect-pdf.html',
  'tools/repair-pdf.html', 'tools/rotate-pdf.html', 'tools/sign-pdf.html',
  'tools/split-pdf.html', 'tools/watermark-pdf.html', 'tools/word-to-pdf.html',
  'tools/pdf-to-text.html', 'tools/pdf-to-markdown.html', 'tools/compare-pdf.html',
  'tools/redact-pdf.html', 'tools/unlock-pdf.html', 'tools/flatten-pdf.html',
  'tools/pdf-to-grayscale.html', 'tools/pdf-metadata.html', 'tools/pdf-info.html',
  'guides/', 'guides/check-photo-before-upload.html',
  'guides/kb-vs-pixels.html', 'guides/pdf-compression-quality.html',
  'about.html', 'contact.html', 'privacy.html', 'terms.html'
];
app.get('/sitemap.xml', async (req, res) => {
  const base = escapeHtml(publicBase(req));
  let guideUrls = '';
  if (dbReady) {
    const guides = await Guide.find({ published: true }).select('slug updatedAt').lean();
    guideUrls = guides.map(g => {
      const updated = g.updatedAt ? new Date(g.updatedAt) : null;
      const lastmod = updated && !Number.isNaN(updated.getTime()) ? `<lastmod>${updated.toISOString().slice(0, 10)}</lastmod>` : '';
      return `<url><loc>${base}/guides/${encodeURIComponent(g.slug)}</loc>${lastmod}</url>`;
    }).join('');
  }
  const staticUrls = staticSitemapPaths.map(p => `<url><loc>${base}/${p}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${guideUrls}</urlset>`);
});
app.get('/robots.txt', (req, res) => {
  const base = publicBase(req).replace(/[\r\n]/g, '');
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin.html\nSitemap: ${base}/sitemap.xml\n`);
});
app.use(express.static(publicDir, { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));

function requireDb(req, res, next) {
  if (dbReady) return next();
  return res.status(503).json({
    error: process.env.MONGODB_URI
      ? 'This section is temporarily unavailable. Please try again shortly.'
      : 'This section is not available on this site right now.'
  });
}
async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.krixo_admin;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload || payload.role !== 'admin' || !payload.sub) return res.status(401).json({ error: 'Your session is not authorized.' });
    if (dbReady) {
      const admin = await Admin.findById(payload.sub).lean();
      if (!admin || admin.role !== 'admin') return res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
      req.admin = { id: admin.id, email: admin.email, role: admin.role };
    } else {
      // Without a database the following requireDb middleware rejects data requests with 503.
      req.admin = { id: payload.sub, email: payload.email, role: payload.role };
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
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
function validObjectId(req, res, label) {
  if (mongoose.isValidObjectId(req.params.id)) return true;
  res.status(400).json({ error: `Invalid ${label} id.` });
  return false;
}

app.get('/api/health', (req, res) => {
  if (process.env.MONGODB_URI && !dbReady) return res.status(503).json({ ok: false, service: 'KriXo API', database: 'unavailable', fileProcessing: 'browser-only' });
  res.json({ ok: true, service: 'KriXo API', database: dbReady ? 'connected' : 'not-configured', fileProcessing: 'browser-only' });
});

app.get('/api/guides', requireDb, async (req, res) => {
  const guides = await Guide.find({ published: true }).select('title slug excerpt category seoTitle seoDescription createdAt updatedAt').sort({ updatedAt: -1 }).lean();
  res.json({ guides });
});
app.get('/api/guides/:slug', requireDb, async (req, res) => {
  const guide = await Guide.findOne({ slug: safeSlug(req.params.slug), published: true }).select('-__v').lean();
  if (!guide) return res.status(404).json({ error: 'Guide not found.' });
  res.json({ guide });
});
app.get('/api/presets', requireDb, async (req, res) => {
  const presets = await Preset.find({ published: true }).select('-__v -sourceUrl').sort({ category: 1, name: 1 }).lean();
  res.json({ presets });
});
app.post('/api/feedback', requireDb, async (req, res) => {
  const message = cleanString(req.body.message, 3000);
  if (message.length < 8) return res.status(400).json({ error: 'Please write at least 8 characters.' });
  const rawEmail = cleanString(req.body.email, 180);
  if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address or leave it blank.' });
  }
  const feedback = await Feedback.create({
    name: cleanString(req.body.name, 100),
    email: rawEmail || undefined,
    type: ['bug', 'idea', 'other'].includes(req.body.type) ? req.body.type : 'other',
    message
  });
  res.status(201).json({ ok: true, id: feedback.id, message: 'Thanks — your feedback has been received.' });
});

app.post('/api/admin/login', loginLimiter, requireDb, async (req, res) => {
  const email = cleanString(req.body.email, 180).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const admin = await Admin.findOne({ email });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const token = jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '8h' });
  res.cookie('krixo_admin', token, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, path: '/' });
  res.json({ ok: true, email: admin.email });
});
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('krixo_admin', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});
// An anonymous session check is not an error; return a clean result so the admin
// page does not log a failed request for every visitor.
app.get('/api/admin/me', (req, res, next) => req.cookies.krixo_admin ? next() : res.json({ admin: null }), requireAdmin, requireDb, (req, res) => res.json({ admin: req.admin }));

app.get('/api/admin/summary', requireAdmin, requireDb, async (req, res) => {
  const [guides, presets, newFeedback] = await Promise.all([
    Guide.countDocuments(), Preset.countDocuments(), Feedback.countDocuments({ status: 'new' })
  ]);
  res.json({ guides, presets, newFeedback });
});

app.get('/api/admin/guides', requireAdmin, requireDb, async (req, res) => {
  const guides = await Guide.find().sort({ updatedAt: -1 }).lean();
  res.json({ guides });
});
app.post('/api/admin/guides', requireAdmin, requireDb, async (req, res) => {
  const title = cleanString(req.body.title, 140);
  const slug = safeSlug(req.body.slug || title);
  const excerpt = cleanString(req.body.excerpt, 320);
  const body = cleanString(req.body.body, 30000);
  if (!title || !slug || !excerpt || !body) return res.status(400).json({ error: 'Title, slug, short description and guide text are required.' });
  try {
    const guide = await Guide.create({ title, slug, excerpt, body, category: cleanString(req.body.category, 50) || 'Guides', published: isTrue(req.body.published), seoTitle: cleanString(req.body.seoTitle, 160), seoDescription: cleanString(req.body.seoDescription, 320) });
    res.status(201).json({ guide });
  } catch (error) { res.status(400).json({ error: error.code === 11000 ? 'That slug already exists.' : 'Could not save this guide.' }); }
});
app.put('/api/admin/guides/:id', requireAdmin, requireDb, async (req, res) => {
  if (!validObjectId(req, res, 'guide')) return;
  const body = req.body || {};
  const update = {};
  if (hasField(body, 'title')) update.title = cleanString(body.title, 140);
  if (hasField(body, 'slug')) update.slug = safeSlug(body.slug);
  if (hasField(body, 'excerpt')) update.excerpt = cleanString(body.excerpt, 320);
  if (hasField(body, 'body')) update.body = cleanString(body.body, 30000).replace(/\r\n?/g, '\n');
  if (hasField(body, 'category')) update.category = cleanString(body.category, 50) || 'Guides';
  if (hasField(body, 'published')) update.published = isTrue(body.published);
  if (hasField(body, 'seoTitle')) update.seoTitle = cleanString(body.seoTitle, 160);
  if (hasField(body, 'seoDescription')) update.seoDescription = cleanString(body.seoDescription, 320);
  if (!Object.keys(update).length) return res.status(400).json({ error: 'No guide fields were provided.' });
  try {
    const guide = await Guide.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!guide) return res.status(404).json({ error: 'Guide not found.' });
    res.json({ guide });
  } catch (error) { res.status(400).json({ error: error.code === 11000 ? 'That slug already exists.' : 'Could not update this guide.' }); }
});
app.delete('/api/admin/guides/:id', requireAdmin, requireDb, async (req, res) => {
  if (!validObjectId(req, res, 'guide')) return;
  const guide = await Guide.findByIdAndDelete(req.params.id);
  if (!guide) return res.status(404).json({ error: 'Guide not found.' });
  res.json({ ok: true });
});

app.get('/api/admin/presets', requireAdmin, requireDb, async (req, res) => {
  const presets = await Preset.find().sort({ category: 1, name: 1 }).lean(); res.json({ presets });
});
app.post('/api/admin/presets', requireAdmin, requireDb, async (req, res) => {
  const body = req.body || {};
  const name = cleanString(body.name, 100);
  const sourceUrl = cleanString(body.sourceUrl, 1000);
  const maxKB = Number(body.maxKB);
  if (!name || !Number.isFinite(maxKB) || maxKB <= 0) return res.status(400).json({ error: 'Preset name and a valid maximum KB are required.' });
  // Optional numeric fields: empty means omitted; 0 is valid for minKB but not for width/height/maxKB.
  const optionalNumber = (value, min) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min ? parsed : null;
  };
  const width = optionalNumber(body.width, 1);
  const height = optionalNumber(body.height, 1);
  const minKB = optionalNumber(body.minKB, 0);
  if (width === null || height === null || minKB === null) return res.status(400).json({ error: 'Width and height must be positive numbers; minimum KB must be a number (0 is allowed).' });
  if (minKB !== undefined && minKB > maxKB) return res.status(400).json({ error: 'Minimum KB cannot be greater than maximum KB.' });
  if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'Reference URL must start with https://.' });
  const checkedAt = body.checkedAt ? new Date(body.checkedAt) : undefined;
  if (checkedAt && Number.isNaN(checkedAt.getTime())) return res.status(400).json({ error: 'Checked date is not a valid date.' });
  const published = isTrue(body.published);
  if (published && (!sourceUrl || !checkedAt)) return res.status(400).json({ error: 'A published preset must include an official https source URL and a checked date.' });
  try {
    const preset = await Preset.create({
      name, category: ['photo','signature','thumb','document'].includes(body.category) ? body.category : 'photo',
      width, height, minKB, maxKB,
      format: ['jpg','png','webp','pdf'].includes(body.format) ? body.format : 'jpg',
      notes: cleanString(body.notes, 500), sourceUrl, checkedAt, published
    });
    res.status(201).json({ preset });
  } catch (error) { res.status(400).json({ error: 'Could not save this preset. Check the preset values and try again.' }); }
});
app.delete('/api/admin/presets/:id', requireAdmin, requireDb, async (req, res) => {
  if (!validObjectId(req, res, 'preset')) return;
  const preset = await Preset.findByIdAndDelete(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset not found.' });
  res.json({ ok: true });
});

app.get('/api/admin/feedback', requireAdmin, requireDb, async (req, res) => {
  const feedback = await Feedback.find().sort({ createdAt: -1 }).limit(200).lean(); res.json({ feedback });
});
app.patch('/api/admin/feedback/:id', requireAdmin, requireDb, async (req, res) => {
  if (!validObjectId(req, res, 'feedback')) return;
  const status = req.body && req.body.status;
  if (typeof status !== 'string' || !['new','reviewed','closed'].includes(status)) return res.status(400).json({ error: 'Status must be new, reviewed or closed.' });
  try {
    const item = await Feedback.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Feedback not found.' });
    res.json({ feedback: item });
  } catch (error) { res.status(400).json({ error: 'Could not update this feedback.' }); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});
app.get('*', (req, res) => {
  const notFound = path.join(publicDir, '404.html');
  if (existsSync(notFound)) return res.status(404).sendFile(notFound);
  res.status(404).type('text/plain').send('Page not found.');
});

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { family: 4, serverSelectionTimeoutMS: 8000 });
      dbReady = true;
      console.log('MongoDB connected.');
    } catch (error) {
      console.error('MongoDB connection failed:', error.message);
      console.error('The public tools can still run; CMS/API features need a working MONGODB_URI.');
    }
  } else {
    console.log('MONGODB_URI is not set. Public tools run; admin CMS and feedback storage are disabled.');
  }
  app.listen(PORT, () => console.log(`KriXo running at http://localhost:${PORT}`));
}
start();
