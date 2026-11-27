import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { proToolIds } from './pro-catalog.js';
import { allTools } from './tool-manifest.js';
import processShim from 'process';
import { initPdfWorkspace } from './pro-workspace.js';
import { detectFileKind, assertRealFile, extensionOf } from './file-validation.js';

/* A few browser bundles still reference Node globals. */
if (typeof globalThis.global === 'undefined') globalThis.global = globalThis;
if (typeof globalThis.process === 'undefined') globalThis.process = processShim;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const fmtBytes = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Drop/paste helpers in some browsers assign a fresh lastModified timestamp,
   so identity uses the stable name/size/type triple instead. */
const fileKey = file => `${file.name}|${file.size}|${file.type}|${file.lastModified}|${file.webkitRelativePath || ''}`;
/* Selection caps match the limits enforced by the processing handlers. */
const MULTI_FILE_LIMITS = {
  'merge-pdf': 30, 'jpg-to-pdf': 40,
  'image-compressor': 20, 'image-resizer': 20, 'photo-signature-resizer': 20, 'image-converter': 20,
  /* These tools take one main PDF plus one helper file (or two PDFs to compare). */
  'compare-pdf': 2, 'edit-pdf': 2, 'sign-pdf': 2, 'watermark-pdf': 2
};

/* A single job token prevents results from an old file appearing after Clear or a new selection. */
let jobToken = 0;
const nextJob = () => ++jobToken;
const busyButtons = new WeakMap();

function icon(name) {
  const paths = {
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4"/><path d="M20 16.5v2A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-2"/>',
    compress: '<path d="m8 3-5 5m0-5v5h5M16 3l5 5m0-5v5h-5M8 21l-5-5m0 5v-5h5m8 5 5-5m0 5v-5h-5"/>',
    resize: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6m10 10-6-6"/><path d="M14 4h6v6M4 14v6h6"/>',
    crop: '<path d="M6 3v12a3 3 0 0 0 3 3h12M18 21V9a3 3 0 0 0-3-3H3"/>',
    convert: '<path d="M7 7h14l-3-3m3 3-3 3M17 17H3l3 3m-3-3 3-3"/>',
    merge: '<path d="M12 3v18m-6-6 6 6 6-6M6 9l6-6 6 6"/>',
    split: '<path d="M12 3v18M6 9l6-6 6 6M6 15l6 6 6-6"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}

function renderShell() {
  const header = $('#site-header');
  if (header) {
    header.innerHTML = `<a class="skip-link" href="#main">Skip to main content</a><div class="shell topbar"><a class="brand" href="/"><img class="brand-logo" src="/assets/krixo-logo.png" alt="" width="36" height="36" decoding="async">KriXo</a><nav class="nav" id="main-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/#all-tools">All Tools</a><a href="/pdf-tools/">PDF Tools</a><a href="/image-tools/">Image Tools</a></nav><button class="mobile-menu" id="mobile-menu" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="main-nav">☰</button></div>`;
    const menu = $('#mobile-menu');
    const nav = $('#main-nav');
    const closeMenu = () => {
      nav?.classList.remove('open');
      if (!menu) return;
      menu.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-label', 'Open menu');
      menu.textContent = '☰';
    };
    menu?.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.textContent = open ? '✕' : '☰';
    });
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    window.addEventListener('hashchange', closeMenu);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav?.classList.contains('open')) {
        closeMenu();
        menu?.focus();
      }
    });
    document.addEventListener('click', e => {
      if (nav?.classList.contains('open') && !e.target.closest('.topbar')) closeMenu();
    });
  }
  const footer = $('#site-footer');
  if (footer) {
    footer.innerHTML = `<div class="shell footer"><div class="footer-top"><div><a class="brand" href="/"><img class="brand-logo" src="/assets/krixo-logo.png" alt="" width="36" height="36" decoding="async">KriXo</a><p>Simple tools for making PDFs and images ready to use. Core file processing happens in your browser, so your documents stay on your device.</p></div><div class="footer-links"><a href="/pdf-tools/">PDF Tools</a><a href="/image-tools/">Image Tools</a><a href="/about.html">About</a><a href="/guides/">Guides</a><a href="/contact.html">Contact</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} KriXo. Built for useful little file jobs.</span><span>Files stay yours. Always check portal requirements before uploading.</span></div></div>`;
  }
  document.querySelectorAll('main').forEach(el => { if (!el.id) el.id = 'main'; });
}

const toolCatalog = allTools;

function setActiveFilter(filter) {
  const state = $('#active-tool-tab');
  if (state) state.dataset.active = filter;
  $$('.tab-pill').forEach(pill => {
    const active = pill.dataset.filter === filter;
    pill.classList.toggle('active', active);
    pill.setAttribute('aria-pressed', String(active));
  });
}

function renderToolCards() {
  const grid = $('#tool-grid');
  if (!grid) return;
  const active = $('#active-tool-tab')?.dataset.active || 'all';
  const query = ($('#tool-search')?.value || '').toLowerCase().trim();
  const filtered = toolCatalog.filter(t => (active === 'all' || t.type === active) && `${t.name} ${t.desc}`.toLowerCase().includes(query));
  grid.innerHTML = filtered.length
    ? filtered.map(t => `<a class="tool-card" href="${t.href}"><span class="tool-arrow">${icon('arrow')}</span><span class="tool-icon ${t.tone}">${icon(t.icon)}</span><h3>${t.name}</h3><p>${t.desc}</p></a>`).join('')
    : '<p class="muted-note">No matching tool yet. Try a different search.</p>';
}

function applyHashFilter() {
  const hash = location.hash.replace('#', '');
  if (hash === 'pdf-tools') setActiveFilter('pdf');
  else if (hash === 'image-tools') setActiveFilter('image');
  else if (hash === 'all-tools') {
    setActiveFilter('all');
    const input = $('#tool-search');
    if (input) input.value = '';
  }
  renderToolCards();
}

function initHome() {
  renderToolCards();
  applyHashFilter();
  window.addEventListener('hashchange', applyHashFilter);
  $$('.tab-pill').forEach(btn => btn.addEventListener('click', () => {
    setActiveFilter(btn.dataset.filter || 'all');
    const search = $('#tool-search');
    if (search) search.value = '';
    renderToolCards();
  }));
  $('#tool-search')?.addEventListener('input', renderToolCards);
  $$('[data-home-filter]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const filter = link.dataset.homeFilter || 'all';
    setActiveFilter(filter);
    const search = $('#tool-search');
    if (search) search.value = link.dataset.search || '';
    renderToolCards();
    $('#all-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('a[href="/#all-tools"]').forEach(link => link.addEventListener('click', event => {
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    event.preventDefault();
    const input = $('#tool-search');
    if (input) input.value = '';
    setActiveFilter('all');
    renderToolCards();
    history.replaceState(null, '', '/#all-tools');
    $('#all-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const searchFromHero = value => {
    const input = $('#tool-search');
    if (input) input.value = value;
    setActiveFilter('all');
    renderToolCards();
    location.hash = 'all-tools';
    $('#all-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#hero-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchFromHero(e.currentTarget.value); } });
  $('#find-tool-btn')?.addEventListener('click', () => searchFromHero($('#hero-search')?.value || ''));
  document.querySelector('.kx-guide .btn-primary')?.addEventListener('click', event => {
    event.preventDefault();
    const panel = $('#fix-my-upload');
    if (panel) { panel.hidden = !panel.hidden; if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  $('#wizard-go')?.addEventListener('click', () => {
    const file = $('#wizard-file')?.value;
    const problem = $('#wizard-problem')?.value;
    const key = `${file}:${problem}`;
    const map = {
      'image:size': '/tools/image-compressor.html', 'image:dimensions': '/tools/image-resizer.html',
      'image:format': '/tools/image-converter.html', 'image:combine': '/tools/jpg-to-pdf.html',
      'pdf:size': '/tools/pdf-compressor.html', 'pdf:combine': '/tools/merge-pdf.html',
      'pdf:split': '/tools/split-pdf.html', 'pdf:rotate': '/tools/rotate-pdf.html',
      'pdf:convert': '/tools/pdf-to-jpg.html', 'pdf:format': '/tools/pdf-to-jpg.html',
      'pdf:text': '/tools/pdf-to-text.html', 'pdf:markdown': '/tools/pdf-to-markdown.html',
      'pdf:compare': '/tools/compare-pdf.html', 'pdf:redact': '/tools/redact-pdf.html',
      'pdf:unlock': '/tools/unlock-pdf.html', 'pdf:flatten': '/tools/flatten-pdf.html',
      'pdf:grayscale': '/tools/pdf-to-grayscale.html', 'pdf:metadata': '/tools/pdf-metadata.html',
      'images:combine': '/tools/jpg-to-pdf.html'
    };
    const singleFile = {
      'images:size': ['/tools/image-compressor.html', 'Compress Image to KB'],
      'images:dimensions': ['/tools/image-resizer.html', 'Resize Image'],
      'images:format': ['/tools/image-converter.html', 'Convert Image']
    };
    if (singleFile[key]) {
      const [url, name] = singleFile[key];
      $('#wizard-result').innerHTML = `${name} works on one image at a time. <a href="${url}">Open the tool</a> and repeat for each image.`;
      return;
    }
    const href = map[key];
    if (!href) { $('#wizard-result').textContent = "That combination doesn't have a tool yet. Try a different task."; return; }
    location.href = href;
  });
}

function setStatus(message, type = 'info') {
  const el = $('#tool-status');
  if (!el) return;
  el.textContent = message;
  el.className = `tool-status show ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
}
function clearStatus() { const el = $('#tool-status'); if (el) { el.className = 'tool-status'; el.textContent = ''; } }

async function renderPdfPreview(url) {
  const response = await fetch(url);
  const data = new Uint8Array(await response.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.2, 720 / Math.max(1, base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    await pdf.destroy();
  }
}

function showResult({ title, detail, url, filename, preview, stats = [] }) {
  const card = $('#result-card');
  if (!card) return;
  if (window.activeOutputUrl) URL.revokeObjectURL(window.activeOutputUrl);
  window.activeOutputUrl = url || null;
  const nextPreviewUrl = preview && /^blob:/i.test(preview) ? preview : null;
  if (window.activePreviewUrl && window.activePreviewUrl !== url && window.activePreviewUrl !== nextPreviewUrl) {
    URL.revokeObjectURL(window.activePreviewUrl);
  }
  window.activePreviewUrl = nextPreviewUrl;
  const titleEl = $('#result-title');
  if (titleEl) { titleEl.textContent = title; titleEl.setAttribute('tabindex', '-1'); }
  const detailEl = $('#result-detail');
  if (detailEl) detailEl.textContent = detail || '';
  const statsEl = $('#result-stats');
  if (statsEl) statsEl.innerHTML = stats.map(s => `<span>${escapeHtml(s)}</span>`).join('');
  const previewEl = $('#result-preview');
  if (previewEl) {
    if (preview) { previewEl.src = preview; previewEl.classList.remove('hidden'); }
    else {
      previewEl.classList.add('hidden');
      previewEl.removeAttribute('src');
      /* PDF handlers return the file itself, not a bitmap. Render page 1 so
         the result card always shows a real preview without a new upload. */
      if (url && /\.pdf$/i.test(filename || '')) {
        renderPdfPreview(url).then(dataUrl => {
          if (window.activeOutputUrl !== url) return;
          previewEl.src = dataUrl;
          previewEl.classList.remove('hidden');
        }).catch(() => { /* Preview is optional; the download still works. */ });
      }
    }
  }
  const link = $('#download-result');
  if (link) {
    if (url) { link.href = url; link.download = filename || 'download'; link.classList.remove('hidden'); link.removeAttribute('aria-disabled'); }
    else { link.removeAttribute('href'); link.classList.add('hidden'); link.setAttribute('aria-disabled', 'true'); }
  }
  const iconEl = $('#result-icon');
  if (iconEl) { iconEl.textContent = '✓'; iconEl.className = 'result-icon success'; }
  card.classList.add('show');
  card.setAttribute('aria-live', 'polite');
  requestAnimationFrame(() => { titleEl?.focus({ preventScroll: true }); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
}

function resetResult() {
  $('#result-card')?.classList.remove('show');
  const previousOutput = window.activeOutputUrl || null;
  if (previousOutput) URL.revokeObjectURL(previousOutput);
  window.activeOutputUrl = null;
  if (window.activePreviewUrl && window.activePreviewUrl !== previousOutput) {
    URL.revokeObjectURL(window.activePreviewUrl);
  }
  window.activePreviewUrl = null;
  const preview = $('#result-preview');
  if (preview) { preview.classList.add('hidden'); preview.removeAttribute('src'); }
  const link = $('#download-result');
  if (link) {
    link.classList.add('hidden');
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
  }
  $('#result-stats')?.replaceChildren();
  const detail = $('#result-detail');
  if (detail) detail.textContent = '';
  const icon = $('#result-icon');
  if (icon) { icon.textContent = '✓'; icon.className = 'result-icon success'; }
  clearStatus();
}

function setBusy(button, busy, text = 'Working…') {
  if (!button) return;
  if (busy) {
    if (!busyButtons.has(button)) busyButtons.set(button, button.textContent);
    button.disabled = true;
    button.textContent = text;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.disabled = false;
    /* Only restore a label we actually replaced. Otherwise calls that simply
       release an old job would overwrite tool-specific labels with "Continue". */
    if (busyButtons.has(button)) {
      button.textContent = busyButtons.get(button) || 'Continue';
      busyButtons.delete(button);
    }
    button.removeAttribute('aria-busy');
  }
  const affected = ['#file-input', '#browse-btn', '#clear-btn', '#process-btn', '#read-metadata-btn'];
  affected.forEach(sel => {
    const el = $(sel);
    if (!el || el === button) return;
    if (busy) el.disabled = true;
    else if (!busyButtons.has(el)) el.disabled = false;
  });
  const zone = $('#dropzone');
  if (zone) zone.classList.toggle('busy', busy);
}

function initDropzone() {
  const input = $('#file-input');
  const zone = $('#dropzone');
  if (!input || !zone) return;
  window.originalDropzoneLabel = $('#dropzone-label')?.textContent || 'Drop your file here';
  window.originalDropzoneSub = $('#dropzone-sub')?.textContent || 'or browse files from your device';
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
  const matchesAccept = file => {
    const rules = String(input.accept || '').split(',').map(rule => rule.trim().toLowerCase()).filter(Boolean);
    if (!rules.length) return true;
    const ext = extensionOf(file.name);
    const type = String(file.type || '').toLowerCase();
    return rules.some(rule => {
      if (rule.startsWith('.')) return ext === rule.slice(1);
      if (rule.endsWith('/*')) {
        if (type.startsWith(rule.slice(0, -1))) return true;
        // Some browsers report an empty MIME type. Fall back to the extension only
        // for formats this site actually supports.
        return rule === 'image/*' && IMAGE_EXTS.includes(ext);
      }
      return type === rule || ext === rule.split('/').pop();
    });
  };
  const acceptFiles = files => {
    const accepted = [...files];
    if (!accepted.length) return;
    const valid = accepted.filter(matchesAccept);
    if (!valid.length) {
      setStatus('That file type is not supported here. Choose a file this tool accepts.', 'error');
      return;
    }
    const tool = document.body.dataset.tool;
    const limit = input.multiple ? (MULTI_FILE_LIMITS[tool] || 1) : 1;
    const existing = input.multiple && limit > 1 ? [...(window.selectedFiles || [])] : [];
    const seen = new Set(existing.map(fileKey));
    const fresh = [];
    let duplicates = 0;
    let overflow = 0;
    for (const file of valid) {
      const key = fileKey(file);
      if (seen.has(key)) { duplicates++; continue; }
      if (existing.length + fresh.length >= limit) { overflow++; continue; }
      seen.add(key);
      fresh.push(file);
    }
    const list = [...existing, ...fresh];
    const skipped = accepted.length - valid.length;
    window.selectedFiles = list;
    window.rotationManualOverride = false;
    const token = nextJob();
    // A replacement file cancels the previous job; release its busy state immediately.
    setBusy($('#process-btn'), false);
    $('#dropzone-label').textContent = list.length === 1 ? list[0].name : `${list.length} files selected`;
    $('#dropzone-sub').textContent = list.map(f => `${f.name} · ${fmtBytes(f.size)}`).join('  |  ').slice(0, 230);
    syncFileList(list);
    renderMergeList();
    if (BATCH_TOOLS.has(tool)) renderBatchGrid(list);
    resetResult();
    if (list.length > 1) destroyWorkspace();
    const notices = [];
    if (overflow) notices.push(`Only the first ${limit} files were kept.`);
    if (skipped) notices.push(input.multiple ? `${skipped} unsupported file${skipped === 1 ? '' : 's'} were skipped.` : 'This tool handles one file at a time. Only the first supported file was kept.');
    if (duplicates) notices.push('A file that was already selected was not added again.');
    if (notices.length) setStatus(notices.join(' '), overflow ? 'error' : 'info');
    /* Launch visual workspace if this tool uses it (single-PDF tools only) */
    if (list.length === 1 && (list[0].name.toLowerCase().endsWith('.pdf') || list[0].type === 'application/pdf')) {
      launchWorkspace(list[0], token);
    }
    /* Reset the native input so the same file can be picked again after removal. */
    input.value = '';
  };
  input.addEventListener('change', e => acceptFiles(e.target.files));
  /* A user-driven change to the uniform angle takes priority over workspace rotations. */
  $('#rotation')?.addEventListener('change', e => { if (e.isTrusted) window.rotationManualOverride = true; });
  zone.addEventListener('click', e => { if (e.target !== input && !e.target.closest('button')) input.click(); });
  $('#browse-btn')?.addEventListener('click', e => { e.stopPropagation(); input.click(); });
  let dragDepth = 0;
  zone.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; zone.classList.add('dragover'); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove('dragover'); });
  zone.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; zone.classList.remove('dragover'); if (e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files); });
}

function requireFiles() {
  if (!window.selectedFiles?.length) { setStatus('Please choose a file first.', 'error'); return null; }
  return window.selectedFiles;
}
function readNumber(selector, fallback, { min = 1, max = Infinity, label = selector } = {}) {
  const el = $(selector);
  const raw = el?.value == null ? '' : String(el.value).trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number between ${min} and ${max === Infinity ? 'any value' : max}.`);
  }
  return value;
}
function fileToImage(file) {
  if (/\.heic$/i.test(file.name) || /heic|heif/i.test(file.type)) {
    return Promise.reject(new Error('HEIC/HEIF images are not supported by this tool. Convert to JPG or PNG first (most phones let you save photos as JPG in settings).'));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened. Try a JPG, PNG or WebP file.')); };
    img.src = url;
  });
}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the output image. Try a smaller image.')), type, quality));
}
function withTimeout(promise, ms = 60000, message = 'This file took too long to process. Try a smaller or simpler file.') {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function friendlyError(error, fallback) {
  const message = String(error?.message || '');
  if (/(?:encrypted pdf|pdf is encrypted|password required|no password given|invalid password|incorrect password|missing password)/i.test(message)) return 'This PDF is password-protected. Unlock it first.';
  if (/(?:damaged|malformed|xref|bad pdf|not a valid pdf|invalid pdf|unexpected token|pdf structure)/i.test(message)) return 'This PDF looks damaged or is not a valid PDF file.';
  if (/canvas|allocation|memory/i.test(message)) return 'This file is too large for your browser to process. Try a smaller copy.';
  if (/heic|heif/i.test(message)) return 'HEIC/HEIF images are not supported. Convert to JPG or PNG first.';
  return message || fallback;
}
function downloadBlob(blob, filename) {
  showResult({ title: 'Your file is ready', detail: 'Processed locally in this browser.', url: URL.createObjectURL(blob), filename, stats: [`Output: ${fmtBytes(blob.size)}`] });
}
const currentJob = token => token === jobToken;

let proRunnerPromise;
function getProRunner() {
  proRunnerPromise ||= import('./pro-tools.js').then(({ createProRunner }) => createProRunner({
    $, $$, setStatus, clearStatus, showResult, resetResult, setBusy,
    requireFiles, friendlyError, nextJob, currentJob, escapeHtml, fmtBytes, downloadBlob
  }));
  return proRunnerPromise;
}

/* ─── PDF Page Workspace integration ─── */

/** Tools that get the visual thumbnail workspace */
const WS_TOOLS = new Set([
  'delete-pdf-pages', 'extract-pdf-pages', 'organize-pdf',
  'rotate-pdf', 'split-pdf', 'add-page-numbers', 'watermark-pdf', 'pdf-to-jpg'
]);

/**
 * Launch (or re-launch) the workspace after a new PDF is accepted.
 * Called from inside acceptFiles() — workspace is fully non-blocking and
 * never prevents the existing handlers from running.
 */
function destroyWorkspace() {
  if (window.pdfWorkspace) {
    window.pdfWorkspace.destroy();
    window.pdfWorkspace = null;
  }
  const container = $('#ws-container');
  if (container) container.replaceChildren();
}

async function launchWorkspace(file, token) {
  const tool = document.body.dataset.tool;
  if (!tool || !WS_TOOLS.has(tool)) return;
  if (token != null && !currentJob(token)) return;

  const container = $('#ws-container');
  if (!container) return;

  /* Destroy previous workspace cleanly */
  destroyWorkspace();

  /* Show loading placeholder immediately */
  container.innerHTML = `<div class="ws-root"><div class="ws-loading" role="status" aria-live="polite"><span class="ws-spinner" aria-hidden="true"></span> Opening PDF…</div></div>`;

  let bytes, pageCount;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    if (token != null && !currentJob(token)) return;
    pageCount = doc.getPageCount();
  } catch (err) {
    if (token != null && !currentJob(token)) return;
    /* Password-protected or corrupt — workspace not available, manual input still works */
    container.innerHTML = `<p class="muted-note" style="padding:10px 0">Thumbnail preview not available for this file. Use the manual input field below.</p>`;
    return;
  }

  /* In delete mode, clicking a thumbnail selects pages to REMOVE. Nothing is
     preselected: an empty selection means "no pages to delete" and the manual
     input stays authoritative. This also avoids the handler's keep-one-page
     guard firing on a fresh upload. */
  const workspace = await initPdfWorkspace({
    tool,
    container,
    file,
    bytes,
    pageCount,
    setStatus,
    isCurrent: token == null ? null : () => currentJob(token),
    onReady: () => {
      /* A stale workspace finishing must not re-enable a button used by a new job. */
      if (token == null || currentJob(token)) setBusy($('#process-btn'), false);
    }
  });
  if (workspace && token != null && !currentJob(token)) workspace.destroy();
}

/* Advanced/manual toggle — wraps manual text input in a <details> alongside workspace */
function initAdvancedToggle() {
  const tool = document.body.dataset.tool;
  if (!tool || !WS_TOOLS.has(tool)) return;
  const grid = $('.form-grid');
  if (!grid) return;
  const wsContainer = $('#ws-container');
  if (!wsContainer) return;

  /* Wrap the ORIGINAL form-grid (keeping all existing IDs) in a <details> element.
     We move the actual node — no cloning — so all existing #id references still work. */
  const toggle = document.createElement('details');
  toggle.className = 'ws-manual-toggle';
  toggle.innerHTML = `<summary>⌨ Manual page input</summary>`;
  /* Move original grid into toggle — IDs preserved, querySelector still finds them */
  toggle.appendChild(grid);
  /* Insert toggle after ws-container */
  wsContainer.after(toggle);
}

/* ─── Visual file ordering (Merge PDF + JPG to PDF) ─── */

const pdfPageCountCache = new WeakMap();
const imageSizeCache = new WeakMap();
function pdfPageCount(file) {
  if (pdfPageCountCache.has(file)) return pdfPageCountCache.get(file);
  const promise = (async () => {
    try {
      const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: false, updateMetadata: false });
      return doc.getPageCount();
    } catch {
      return null;
    }
  })();
  pdfPageCountCache.set(file, promise);
  return promise;
}

function imageSize(file) {
  if (imageSizeCache.has(file)) return imageSizeCache.get(file);
  const promise = fileToImage(file).then(img => `${img.naturalWidth} × ${img.naturalHeight}`).catch(() => 'image unreadable');
  imageSizeCache.set(file, promise);
  return promise;
}

async function describeOrderedFile(file) {
  const tool = document.body.dataset.tool;
  if (tool === 'merge-pdf') {
    const count = await pdfPageCount(file);
    return count ? `${count} page${count === 1 ? '' : 's'}` : 'page count unavailable';
  }
  if (tool === 'jpg-to-pdf') return imageSize(file);
  return file.type || 'file';
}

function syncFileList(list = window.selectedFiles || []) {
  const target = $('#file-list');
  if (!target) return;
  target.replaceChildren(...list.map((file, index) => {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `<span>${index + 1}. ${escapeHtml(file.name)} · ${fmtBytes(file.size)}</span><span>${escapeHtml(file.type || 'file')}</span>`;
    return row;
  }));
}

async function renderMergeList() {
  const target = $('#merge-list');
  if (!target) return;
  const files = window.selectedFiles || [];
  const hint = $('#merge-hint');
  if (hint) hint.style.display = files.length > 1 ? '' : 'none';
  if (!files.length) {
    target.replaceChildren();
    return;
  }
  const generation = (window.__mergeRenderId = (window.__mergeRenderId || 0) + 1);
  target.replaceChildren(...files.map((file, index) => {
    const row = document.createElement('div');
    row.className = 'merge-file-item';
    row.draggable = true;
    row.tabIndex = 0;
    row.dataset.index = String(index);
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `Position ${index + 1}: ${file.name}. Drag, or press Alt with arrow up or down, to move this file.`);
    row.innerHTML = `<span class="mfi-num">${index + 1}</span><div class="mfi-info"><div class="mfi-name">${escapeHtml(file.name)}</div><div class="mfi-meta" data-merge-meta="${index}">${fmtBytes(file.size)} · reading…</div></div><button class="mfi-remove" type="button" aria-label="Remove ${escapeHtml(file.name)}">×</button><span class="mfi-drag-handle" aria-hidden="true">⋮⋮</span>`;
    return row;
  }));
  for (const [index, file] of files.entries()) {
    const detail = await describeOrderedFile(file);
    if (generation !== window.__mergeRenderId) return;
    const meta = target.querySelector(`[data-merge-meta="${index}"]`);
    if (meta) meta.textContent = `${fmtBytes(file.size)} · ${detail}`;
  }
}

function moveMergeFile(from, to) {
  const files = window.selectedFiles || [];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= files.length || to >= files.length) return;
  const list = [...files];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  window.selectedFiles = list;
  syncFileList(list);
  renderMergeList();
  setStatus(`Moved “${moved.name}” to position ${to + 1}.`, 'info');
}

function initMergeList() {
  const target = $('#merge-list');
  if (!target) return;

  target.addEventListener('click', event => {
    const button = event.target.closest('.mfi-remove');
    if (!button) return;
    const row = button.closest('.merge-file-item');
    const index = Number(row?.dataset.index);
    const files = window.selectedFiles || [];
    if (!Number.isInteger(index) || index < 0 || index >= files.length) return;
    const [removed] = files.splice(index, 1);
    window.selectedFiles = files;
    nextJob();
    syncFileList(files);
    renderMergeList();
    setStatus(`Removed “${removed.name}”. Add another file if you want to include it.`, 'info');
  });

  target.addEventListener('keydown', event => {
    const row = event.target.closest('.merge-file-item');
    if (!row || !event.altKey) return;
    const index = Number(row.dataset.index);
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveMergeFile(index, index - 1);
      target.querySelector(`[data-index="${Math.max(0, index - 1)}"]`)?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveMergeFile(index, index + 1);
      target.querySelector(`[data-index="${Math.min((window.selectedFiles || []).length - 1, index + 1)}"]`)?.focus();
    }
  });

  target.addEventListener('dragstart', event => {
    const row = event.target.closest('.merge-file-item');
    if (!row) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', row.dataset.index);
    row.classList.add('mfi-dragging');
  });

  target.addEventListener('dragover', event => {
    const row = event.target.closest('.merge-file-item');
    if (!row) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    target.querySelectorAll('.mfi-drag-over').forEach(el => el.classList.remove('mfi-drag-over'));
    row.classList.add('mfi-drag-over');
  });

  target.addEventListener('dragleave', event => {
    event.target.closest('.merge-file-item')?.classList.remove('mfi-drag-over');
  });

  target.addEventListener('drop', event => {
    event.preventDefault();
    const row = event.target.closest('.merge-file-item');
    if (!row) return;
    const from = Number(event.dataTransfer.getData('text/plain'));
    moveMergeFile(from, Number(row.dataset.index));
  });

  target.addEventListener('dragend', () => {
    target.querySelectorAll('.mfi-dragging, .mfi-drag-over').forEach(el => el.classList.remove('mfi-dragging', 'mfi-drag-over'));
  });
}

const BATCH_TOOLS = new Set(['image-compressor', 'image-resizer', 'image-converter']);

function renderBatchGrid(files = []) {
  const grid = $('#batch-grid');
  if (!grid) return;
  grid.replaceChildren(...files.map((file, index) => {
    const cell = document.createElement('div');
    cell.className = 'batch-cell';
    cell.dataset.batchIndex = String(index);
    cell.innerHTML = `<img alt="" hidden><span class="batch-name">${escapeHtml(file.name)}</span><span class="batch-status" role="status">Queued</span>`;
    return cell;
  }));
}

function setBatchStatus(index, text, state, previewUrl) {
  const cell = $(`#batch-grid .batch-cell[data-batch-index="${index}"]`);
  if (!cell) return;
  cell.className = `batch-cell ${state || ''}`.trim();
  const status = cell.querySelector('.batch-status');
  if (status) status.textContent = text;
  if (previewUrl) {
    const image = cell.querySelector('img');
    if (image && !image.src) { image.src = previewUrl; image.hidden = false; }
  }
}

async function processSingleImage(file, mode, token) {
  if (file.size > 35 * 1024 * 1024) throw new Error('This version supports images up to 35 MB per file.');
  const img = await fileToImage(file);
  if (!currentJob(token)) return null;
  if (img.naturalWidth * img.naturalHeight > 45_000_000) throw new Error('This image has too many pixels for safe browser processing. Try a smaller copy.');
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  const requestedWidth = readNumber('#width', width, { label: 'Width' });
  const requestedHeight = readNumber('#height', height, { label: 'Height' });
  let cropToFill = false;
  if (mode === 'resize' || mode === 'photo') {
    if ($('#keep-ratio')?.checked) {
      const ratio = Math.min(requestedWidth / width, requestedHeight / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    } else {
      width = Math.max(1, Math.min(requestedWidth, 10000));
      height = Math.max(1, Math.min(requestedHeight, 10000));
      if (width * height > 40_000_000) throw new Error('Requested dimensions are too large. Keep the total under 40 megapixels.');
      cropToFill = mode === 'photo';
    }
  }
  const outputType = $('#output-format')?.value || 'image/jpeg';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: outputType !== 'image/jpeg' });
  if (outputType === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
  if (cropToFill) {
    const targetRatio = width / height;
    const sourceRatio = img.naturalWidth / img.naturalHeight;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (sourceRatio > targetRatio) { sw = img.naturalHeight * targetRatio; sx = (img.naturalWidth - sw) / 2; }
    else { sh = img.naturalWidth / targetRatio; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  } else ctx.drawImage(img, 0, 0, width, height);

  let blob;
  const targetKB = readNumber('#target-kb', 0, { min: 1, max: 50000, label: 'Maximum file size' });
  if (mode === 'compress' || mode === 'photo') {
    if (!targetKB) throw new Error('Enter a valid maximum file size in KB.');
    const target = targetKB * 1024;
    let q = 0.92;
    if (outputType !== 'image/png') {
      blob = await canvasBlob(canvas, outputType, q);
      while (blob.size > target && q > 0.36) { q -= 0.07; blob = await canvasBlob(canvas, outputType, q); }
    } else blob = await canvasBlob(canvas, outputType);
    let scale = 1;
    while (blob.size > target && scale > 0.35) {
      scale *= 0.88;
      const smaller = document.createElement('canvas');
      smaller.width = Math.max(1, Math.round(width * scale));
      smaller.height = Math.max(1, Math.round(height * scale));
      const smallerCtx = smaller.getContext('2d', { alpha: outputType !== 'image/jpeg' });
      if (outputType === 'image/jpeg') { smallerCtx.fillStyle = '#fff'; smallerCtx.fillRect(0, 0, smaller.width, smaller.height); }
      smallerCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      blob = await canvasBlob(smaller, outputType, Math.max(0.38, q));
      width = smaller.width;
      height = smaller.height;
    }
    if (blob.size > target) throw new Error(`Could not reach ${targetKB} KB without reducing quality too much. Try a higher limit or smaller dimensions.`);
  } else blob = await canvasBlob(canvas, outputType, 0.92);
  if (!currentJob(token)) return null;

  const actualType = blob.type || outputType;
  const ext = actualType === 'image/png' ? 'png' : actualType === 'image/webp' ? 'webp' : 'jpg';
  return {
    blob,
    width,
    height,
    ext,
    filename: `${file.name.replace(/\.[^.]+$/, '')}-krixo.${ext}`,
    url: URL.createObjectURL(blob),
    note: actualType !== outputType ? `Your browser saved this as ${actualType}. The file is still usable.` : ''
  };
}

async function imageProcess(mode) {
  const files = requireFiles();
  if (!files) return;
  if (files.length > 20) { setStatus('You can process up to 20 images in one batch. Remove a few and try again.', 'error'); return; }
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Processing…');
  clearStatus();
  renderBatchGrid(files);
  const results = [];
  let totalOriginal = 0;
  let totalOutput = 0;
  let formatNote = '';
  try {
    for (const [index, file] of files.entries()) {
      if (!currentJob(token)) return;
      setStatus(`Processing image ${index + 1} of ${files.length}: ${file.name}…`, 'info');
      setBatchStatus(index, 'Working…', 'batch-working');
      const result = await processSingleImage(file, mode, token);
      if (!currentJob(token)) return;
      if (!result) return;
      results.push(result);
      totalOriginal += file.size;
      totalOutput += result.blob.size;
      formatNote ||= result.note;
      setBatchStatus(index, `${result.width} × ${result.height} · ${fmtBytes(result.blob.size)}`, 'batch-done', result.url);
    }

    if (results.length === 1) {
      const result = results[0];
      const savedKB = Math.max(0, Math.round((files[0].size - result.blob.size) / 1024));
      showResult({
        title: 'Your image is ready',
        detail: `${result.width} × ${result.height} px · ${fmtBytes(result.blob.size)}`,
        url: result.url,
        filename: result.filename,
        preview: result.url,
        stats: [`Original: ${fmtBytes(files[0].size)}`, `Saved: ${savedKB} KB`, `Format: ${result.ext.toUpperCase()}`]
      });
      setStatus(formatNote || 'Done. Your image was processed on this device; it was not uploaded.', 'success');
      return;
    }

    const zip = new JSZip();
    results.forEach(result => zip.file(result.filename, result.blob));
    /* Only the first thumbnail is used by the result card; release the rest. */
    results.slice(1).forEach(result => {
      if (result.url && result.url !== results[0].url) URL.revokeObjectURL(result.url);
      result.url = null;
    });
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    if (!currentJob(token)) return;
    const zipUrl = URL.createObjectURL(zipBlob);
    showResult({
      title: `${results.length} images are ready`,
      detail: `ZIP archive · ${fmtBytes(zipBlob.size)}`,
      url: zipUrl,
      filename: 'krixo-images.zip',
      preview: results[0].url,
      stats: [`Images: ${results.length}`, `Original: ${fmtBytes(totalOriginal)}`, `Processed: ${fmtBytes(totalOutput)}`]
    });
    setStatus(formatNote || `Done. ${results.length} images were processed on your device and packaged into one ZIP.`, 'success');
  } catch (err) {
    const failedIndex = results.length;
    if (Number.isInteger(failedIndex)) setBatchStatus(failedIndex, friendlyError(err, 'Failed'), 'batch-error');
    results.forEach(result => {
      if (result.url && result.url !== window.activeOutputUrl && result.url !== window.activePreviewUrl) {
        URL.revokeObjectURL(result.url);
      }
    });
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not process these images.'), 'error');
  } finally {
    if (!currentJob(token)) {
      /* Cancelled or replaced: release any thumbnails that were never shown. */
      results.forEach(result => {
        if (result.url && result.url !== window.activeOutputUrl && result.url !== window.activePreviewUrl) {
          URL.revokeObjectURL(result.url);
        }
      });
    } else setBusy(button, false);
  }
}

async function checkFile() {
  const files = requireFiles();
  if (!files) return;
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Checking…');
  clearStatus();
  try {
    const file = files[0];
    const minKB = readNumber('#min-kb', 0, { min: 1, max: 50000, label: 'Minimum KB' });
    const maxKB = readNumber('#max-kb', 0, { min: 1, max: 50000, label: 'Maximum KB' });
    const maxWidth = readNumber('#check-width', 0, { label: 'Width' });
    const maxHeight = readNumber('#check-height', 0, { label: 'Height' });
    const dimensionMode = $('#dimension-mode')?.value || 'max';
    if (!minKB && !maxKB && !maxWidth && !maxHeight) throw new Error('Enter at least one limit to check your file.');
    if (minKB && maxKB && minKB > maxKB) throw new Error('Minimum KB cannot be greater than maximum KB.');
    if (dimensionMode === 'exact' && (!maxWidth || !maxHeight)) throw new Error('Enter both width and height for an exact dimension check.');
    if (!file.size) throw new Error('That file is empty. Choose a different file.');
    const probe = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
    assertRealFile(file, probe);
    if (!currentJob(token)) return;
    const detected = detectFileKind(probe);
    const ext = extensionOf(file.name);
    const rules = [];
    const sizeOk = (!minKB || file.size >= minKB * 1024) && (!maxKB || file.size <= maxKB * 1024);
    const sizeExpected = minKB && maxKB ? `${minKB}–${maxKB} KB` : minKB ? `≥ ${minKB} KB` : maxKB ? `≤ ${maxKB} KB` : 'No limit set';
    rules.push({ label: 'File size', ok: sizeOk, actual: fmtBytes(file.size), expected: sizeExpected });
    const isImageFile = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext) && detected !== 'pdf';
    const isPdfFile = ext === 'pdf' && detected === 'pdf';
    if (isImageFile) {
      const img = await fileToImage(file);
      if (!currentJob(token)) return;
      const dimsOk = dimensionMode === 'exact'
        ? ((!maxWidth || img.width === maxWidth) && (!maxHeight || img.height === maxHeight))
        : ((!maxWidth || img.width <= maxWidth) && (!maxHeight || img.height <= maxHeight));
      const dimsExpected = `${maxWidth || 'Any'} × ${maxHeight || 'Any'} px ${dimensionMode === 'exact' ? 'exact' : 'max'}`;
      rules.push({ label: 'Image dimensions', ok: dimsOk, actual: `${img.width} × ${img.height} px`, expected: dimsExpected });
    } else if (isPdfFile) {
      rules.push({ label: 'File type', ok: true, actual: 'PDF', expected: 'PDF accepted' });
      if (maxWidth || maxHeight) rules.push({ label: 'Image dimensions', ok: false, actual: 'Not available for PDFs', expected: 'Use an image file to check pixels' });
    } else rules.push({ label: 'File type', ok: false, actual: file.type || 'Unknown', expected: 'JPG, PNG, WebP, GIF, BMP or PDF' });
    const allOk = rules.every(r => r.ok);
    const titleEl = $('#result-title');
    if (titleEl) { titleEl.textContent = allOk ? 'All checks passed' : 'Some requirements need attention'; titleEl.setAttribute('tabindex', '-1'); }
    const detailEl = $('#result-detail');
    if (detailEl) detailEl.textContent = 'Check the details below. The checker does not change your file.';
    const statsEl = $('#result-stats');
    if (statsEl) statsEl.innerHTML = rules.map(r => `<span class="${r.ok ? 'check-pass' : 'check-fail'}">${r.ok ? '✓' : '!'} ${r.label}: ${escapeHtml(r.actual)} · ${escapeHtml(r.expected)}</span>`).join('<br>');
    const iconEl = $('#result-icon');
    if (iconEl) { iconEl.textContent = allOk ? '✓' : '!'; iconEl.className = `result-icon ${allOk ? 'success' : 'danger'}`; }
    $('#result-preview')?.classList.add('hidden');
    const link = $('#download-result');
    if (link) { link.classList.add('hidden'); link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
    const card = $('#result-card');
    card?.classList.add('show');
    setStatus(allOk ? 'Your file meets the limits you entered.' : 'This file does not meet every limit. Use the matching resize or compress tool.', allOk ? 'success' : 'error');
    requestAnimationFrame(() => { titleEl?.focus({ preventScroll: true }); card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not check this file.'), 'error');
  } finally {
    if (currentJob(token)) setBusy(button, false);
  }
}

async function compressPdf() {
  const files = requireFiles();
  if (!files) return;
  const file = files[0];
  const rawTarget = String($('#target-kb')?.value ?? '').trim();
  const targetKB = rawTarget === '' ? 0 : Number(rawTarget);
  if (!Number.isFinite(targetKB) || targetKB < 10 || targetKB > 50000) {
    setStatus('Choose a target between 10 and 50000 KB.', 'error');
    return;
  }
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Compressing pages…');
  clearStatus();
  let pdf = null;
  try {
    if (file.size > 45 * 1024 * 1024) throw new Error('This version supports PDF files up to 45 MB for compression.');
    const source = new Uint8Array(await file.arrayBuffer());
    pdf = await withTimeout(pdfjsLib.getDocument({ data: source, disableWorker: true }).promise, 60000, 'This PDF took too long to open. Try a smaller or simpler file.');
    if (pdf.numPages > 60) throw new Error('For browser stability, this version supports up to 60 pages per compression job.');
    const targetBytes = targetKB * 1024;
    if (file.size <= targetBytes) {
      if (!currentJob(token)) return;
      const url = URL.createObjectURL(file);
      showResult({ title: 'No compression needed', detail: `Your PDF is already ${fmtBytes(file.size)}, under the ${targetKB} KB target.`, url, filename: file.name, stats: [`Original: ${fmtBytes(file.size)}`, `Target: ${targetKB} KB`, `Pages: ${pdf.numPages}`] });
      setStatus('This PDF already meets your target. You can download the original if you like.', 'info');
      return;
    }
    const attempts = [{ scale: 1.25, q: 0.76 }, { scale: 1.0, q: 0.65 }, { scale: 0.82, q: 0.55 }, { scale: 0.65, q: 0.45 }, { scale: 0.5, q: 0.38 }];
    let output = null;
    for (let attempt = 0; attempt < attempts.length; attempt++) {
      if (!currentJob(token)) return;
      const { scale, q } = attempts[attempt];
      const out = await PDFDocument.create();
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const pct = Math.round(((attempt * pdf.numPages + pageNo - 1) / (attempts.length * pdf.numPages)) * 100);
        setStatus(`Compressing page ${pageNo} of ${pdf.numPages} · pass ${attempt + 1}/${attempts.length} · ${pct}%`, 'info');
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, 60000, 'A page in this PDF could not be rendered. Try a different PDF.');
        const blob = await canvasBlob(canvas, 'image/jpeg', q);
        const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const originalViewport = page.getViewport({ scale: 1 });
        const outPage = out.addPage([originalViewport.width, originalViewport.height]);
        outPage.drawImage(jpg, { x: 0, y: 0, width: originalViewport.width, height: originalViewport.height });
        canvas.width = 1;
        canvas.height = 1;
      }
      output = new Blob([await out.save({ useObjectStreams: true })], { type: 'application/pdf' });
      if (output.size <= targetBytes) break;
    }
    if (!currentJob(token)) return;
    if (!output || output.size > targetBytes) throw new Error(`The PDF could not fit under ${targetKB} KB while keeping a reasonable preview. Try splitting it or choosing a larger target.`);
    const url = URL.createObjectURL(output);
    const filename = `${file.name.replace(/\.pdf$/i, '')}-compressed.pdf`;
    const savedKB = Math.max(0, Math.round((file.size - output.size) / 1024));
    const pct = Math.round((1 - output.size / file.size) * 100);
    showResult({
      title: 'Compressed PDF is ready',
      detail: `${fmtBytes(file.size)} → ${fmtBytes(output.size)} (${pct}% smaller)`,
      url,
      filename,
      stats: [`Original: ${fmtBytes(file.size)}`, `Output: ${fmtBytes(output.size)}`, `Saved: ${savedKB} KB`, `Pages: ${pdf.numPages}`]
    });
    setStatus('Done. Important: this strong compression converts pages into images, so text may no longer be selectable and small print may lose clarity. Open and inspect the PDF before using it.', 'success');
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not compress this PDF.'), 'error');
  } finally {
    await pdf?.destroy?.();
    if (currentJob(token)) setBusy(button, false);
  }
}

async function mergePdfs() {
  const files = requireFiles();
  if (!files) return;
  if (files.length < 2) { setStatus('Choose at least two PDF files to merge.', 'error'); return; }
  if (files.length > 30) { setStatus('This browser build can merge up to 30 PDF files at once. Remove a few files and try again.', 'error'); return; }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > 150 * 1024 * 1024) {
    setStatus('The combined size of all PDFs exceeds 150 MB. Remove some files or try smaller copies.', 'error');
    return;
  }
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Merging…');
  clearStatus();
  try {
    const merged = await PDFDocument.create();
    let totalPages = 0;
    for (const [i, file] of files.entries()) {
      if (!currentJob(token)) return;
      setStatus(`Reading file ${i + 1} of ${files.length}: ${file.name}…`, 'info');
      if (file.size > 45 * 1024 * 1024) throw new Error(`"${file.name}" is over 45 MB. Try a smaller copy.`);
      const doc = await PDFDocument.load(await file.arrayBuffer());
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
      totalPages += pages.length;
    }
    if (!currentJob(token)) return;
    const blob = new Blob([await merged.save()], { type: 'application/pdf' });
    if (!currentJob(token)) return;
    const url = URL.createObjectURL(blob);
    showResult({
      title: 'Merged PDF is ready',
      detail: `${files.length} files combined into one PDF.`,
      url,
      filename: 'krixo-merged.pdf',
      stats: [`Files: ${files.length}`, `Total pages: ${totalPages}`, `Output: ${fmtBytes(blob.size)}`]
    });
    setStatus(`Merged ${files.length} PDFs (${totalPages} pages) successfully.`, 'success');
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not merge these PDFs. Password-protected files are not supported.'), 'error');
  } finally { if (currentJob(token)) setBusy(button, false); }
}

function parseRanges(text, max) {
  const pages = new Set();
  for (const part of text.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(`Invalid page range: ${part}`);
    const start = Number(m[1]);
    const end = Number(m[2] || m[1]);
    if (start < 1 || end < start || end > max) throw new Error(`Page range ${part} is outside 1–${max}.`);
    for (let n = start; n <= end; n++) pages.add(n - 1);
  }
  if (!pages.size) throw new Error('Enter page numbers such as 1-3,5.');
  return [...pages].sort((a, b) => a - b);
}

async function splitPdf() {
  const files = requireFiles();
  if (!files) return;
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Extracting pages…');
  clearStatus();
  try {
    if (files[0].size > 45 * 1024 * 1024) throw new Error('This version supports PDF files up to 45 MB.');
    const source = await PDFDocument.load(await files[0].arrayBuffer());
    const count = source.getPageCount();
    const rangeText = $('#page-ranges')?.value || '';
    if (!rangeText.trim()) throw new Error('Enter page numbers or a range, for example 1-3,5.');
    const indexes = parseRanges(rangeText, count);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(source, indexes);
    pages.forEach(p => out.addPage(p));
    const blob = new Blob([await out.save()], { type: 'application/pdf' });
    if (!currentJob(token)) return;
    const url = URL.createObjectURL(blob);
    showResult({
      title: 'Split PDF is ready',
      detail: `Extracted ${indexes.length} of ${count} pages.`,
      url,
      filename: `${files[0].name.replace(/\.pdf$/i, '')}-pages.pdf`,
      stats: [`Extracted: ${indexes.length} page${indexes.length === 1 ? '' : 's'}`, `Source: ${count} pages`, `Output: ${fmtBytes(blob.size)}`]
    });
    setStatus(`Created a new PDF with ${indexes.length} selected page${indexes.length === 1 ? '' : 's'}.`, 'success');
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not split this PDF.'), 'error');
  } finally { if (currentJob(token)) setBusy(button, false); }
}

async function rotatePdf() {
  const files = requireFiles();
  if (!files) return;
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Rotating…');
  clearStatus();
  try {
    if (files[0].size > 45 * 1024 * 1024) throw new Error('This version supports PDF files up to 45 MB.');
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    assertRealFile(files[0], bytes);
    const doc = await PDFDocument.load(bytes);
    const count = doc.getPageCount();

    /* Check if workspace has per-page rotations */
    const wsRotations = window.pdfWorkspace?.getRotations?.() ?? new Map();
    const hasPerPageRotations = wsRotations.size > 0 && !window.rotationManualOverride;

    if (hasPerPageRotations) {
      /* Apply individual per-page rotation from workspace */
      let rotatedCount = 0;
      doc.getPages().forEach((p, idx) => {
        const rot = wsRotations.get(idx) ?? 0;
        if (rot !== 0) {
          p.setRotation(degrees((p.getRotation().angle + rot) % 360));
          rotatedCount++;
        }
      });
      const blob = new Blob([await doc.save()], { type: 'application/pdf' });
      if (!currentJob(token)) return;
      const url = URL.createObjectURL(blob);
      showResult({
        title: 'Rotated PDF is ready',
        detail: `${rotatedCount} of ${count} page${count === 1 ? '' : 's'} rotated individually.`,
        url,
        filename: `${files[0].name.replace(/\.pdf$/i, '')}-rotated.pdf`,
        stats: [`Pages rotated: ${rotatedCount}`, `Total pages: ${count}`, `Output: ${fmtBytes(blob.size)}`]
      });
      setStatus(`Rotated ${rotatedCount} page${rotatedCount === 1 ? '' : 's'} individually.`, 'success');
    } else {
      /* Fall back to uniform rotation from the select element */
      const angle = Number($('#rotation')?.value || 90);
      if (![90, 180, 270].includes(angle)) throw new Error('Choose a rotation of 90, 180 or 270 degrees.');
      doc.getPages().forEach(p => p.setRotation(degrees((p.getRotation().angle + angle) % 360)));
      const blob = new Blob([await doc.save()], { type: 'application/pdf' });
      if (!currentJob(token)) return;
      const url = URL.createObjectURL(blob);
      showResult({
        title: 'Rotated PDF is ready',
        detail: `All ${count} page${count === 1 ? '' : 's'} rotated by ${angle}°.`,
        url,
        filename: `${files[0].name.replace(/\.pdf$/i, '')}-rotated.pdf`,
        stats: [`Rotation: ${angle}°`, `Pages: ${count}`, `Output: ${fmtBytes(blob.size)}`]
      });
      setStatus(`Rotated ${count} page${count === 1 ? '' : 's'} by ${angle}°.`, 'success');
    }
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not rotate this PDF.'), 'error');
  } finally { if (currentJob(token)) setBusy(button, false); }
}

async function imagesToPdf() {
  const files = requireFiles();
  if (!files) return;
  if (files.length > 40) { setStatus('Choose up to 40 images per PDF.', 'error'); return; }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > 150 * 1024 * 1024) { setStatus('The combined size of all images exceeds 150 MB. Remove some images and try again.', 'error'); return; }
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Creating PDF…');
  clearStatus();
  try {
    const doc = await PDFDocument.create();
    const size = $('#page-size')?.value || 'a4';
    const pageDims = size === 'letter' ? [612, 792] : [595.28, 841.89];
    for (const file of files) {
      if (!currentJob(token)) return;
      if (file.size > 35 * 1024 * 1024) throw new Error('Each image must be under 35 MB.');
      const img = await fileToImage(file);
      if (img.naturalWidth * img.naturalHeight > 45_000_000) throw new Error('One of these images has too many pixels. Try a smaller copy.');
      const maxArea = 12_000_000;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w * h > maxArea) { const scale = Math.sqrt(maxArea / (w * h)); w = Math.round(w * scale); h = Math.round(h * scale); setStatus('Large images were reduced before being placed in the PDF.', 'info'); }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const jpg = await canvasBlob(canvas, 'image/jpeg', 0.9);
      const embedded = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const page = doc.addPage(pageDims);
      const margin = 24;
      const scale = Math.min((pageDims[0] - margin * 2) / embedded.width, (pageDims[1] - margin * 2) / embedded.height);
      const dw = embedded.width * scale;
      const dh = embedded.height * scale;
      page.drawImage(embedded, { x: (pageDims[0] - dw) / 2, y: (pageDims[1] - dh) / 2, width: dw, height: dh });
      canvas.width = 1;
      canvas.height = 1;
    }
    const blob = new Blob([await doc.save()], { type: 'application/pdf' });
    if (!currentJob(token)) return;
    const url = URL.createObjectURL(blob);
    showResult({
      title: `${files.length}-page PDF is ready`,
      detail: `${files.length} image${files.length === 1 ? '' : 's'} combined into one PDF.`,
      url,
      filename: 'krixo-images.pdf',
      stats: [`Images: ${files.length}`, `Output: ${fmtBytes(blob.size)}`]
    });
    setStatus(`Created a ${files.length}-page PDF.`, 'success');
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not create PDF from these images.'), 'error');
  } finally { if (currentJob(token)) setBusy(button, false); }
}

async function pdfToImages() {
  const files = requireFiles();
  if (!files) return;
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Rendering pages…');
  clearStatus();
  let pdf = null;
  try {
    if (files[0].size > 45 * 1024 * 1024) throw new Error('This version supports PDF files up to 45 MB.');
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    assertRealFile(files[0], bytes);
    pdf = await withTimeout(pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise, 60000, 'This PDF took too long to open. Try a smaller or simpler file.');
    const pageInput = ($('#image-pages')?.value || '').trim();
    const pages = pageInput
      ? parseRanges(pageInput, pdf.numPages).map(index => index + 1)
      : Array.from({ length: pdf.numPages }, (_, index) => index + 1);
    if (pages.length > 40) throw new Error('This version exports up to 40 pages per job. Enter a smaller page range.');
    const zip = new JSZip();
    const format = $('#image-format')?.value || 'image/jpeg';
    const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
    for (const [position, n] of pages.entries()) {
      if (!currentJob(token)) return;
      setStatus(`Rendering page ${n} of ${pdf.numPages} (${position + 1}/${pages.length})…`, 'info');
      const page = await pdf.getPage(n);
      let scale = 1.5;
      let viewport = page.getViewport({ scale });
      const longest = Math.max(viewport.width, viewport.height);
      if (longest > 4096) {
        scale *= 4096 / longest;
        viewport = page.getViewport({ scale });
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, 60000, 'A page in this PDF could not be rendered. Try a different PDF.');
      const blob = await canvasBlob(canvas, format, 0.9);
      zip.file(`page-${String(n).padStart(3, '0')}.${ext}`, blob);
      canvas.width = 1;
      canvas.height = 1;
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    if (!currentJob(token)) { URL.revokeObjectURL(url); return; }
    showResult({
      title: 'Images are ready',
      detail: `Exported ${pages.length} page${pages.length === 1 ? '' : 's'} as ${ext.toUpperCase()} images in one ZIP file.`,
      url,
      filename: `${files[0].name.replace(/\.pdf$/i, '')}-images.zip`,
      stats: [`Pages: ${pages.length} of ${pdf.numPages}`, `Output: ${fmtBytes(blob.size)}`]
    });
    setStatus(`Exported ${pages.length} page${pages.length === 1 ? '' : 's'} into a ZIP file.`, 'success');
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not convert this PDF.'), 'error');
  } finally {
    await pdf?.destroy?.();
    if (currentJob(token)) setBusy(button, false);
  }
}

async function showPdfInfo() {
  const files = requireFiles();
  if (!files) return;
  const file = files[0];
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    setStatus('Choose a PDF file.', 'error');
    return;
  }
  const token = nextJob();
  const button = $('#process-btn');
  setBusy(button, true, 'Reading…');
  clearStatus();
  try {
    if (file.size > 150 * 1024 * 1024) throw new Error('This version supports PDF files up to 150 MB for inspection.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertRealFile(file, bytes);
    if (!currentJob(token)) return;

    // Try pdf-lib first (gets metadata); fall back to PDF.js for encrypted files
    let pages = 0;
    let title = '', author = '', subject = '', creator = '', producer = '';
    let isEncrypted = false;
    let firstPageW = 0, firstPageH = 0;

    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      pages = doc.getPageCount();
      title = doc.getTitle() || '';
      author = doc.getAuthor() || '';
      subject = doc.getSubject() || '';
      creator = doc.getCreator() || '';
      producer = doc.getProducer() || '';
      if (pages > 0) {
        const p = doc.getPage(0);
        firstPageW = Math.round(p.getWidth());
        firstPageH = Math.round(p.getHeight());
      }
    } catch (pdfLibErr) {
      const msg = String(pdfLibErr?.message || '');
      if (/encrypted|password/i.test(msg)) {
        isEncrypted = true;
        let pdfjs = null;
        try {
          pdfjs = await withTimeout(pdfjsLib.getDocument({ data: bytes.slice(0), password: '', disableWorker: true }).promise, 20000, '');
          pages = pdfjs.numPages;
          const p = await pdfjs.getPage(1);
          const vp = p.getViewport({ scale: 1 });
          firstPageW = Math.round(vp.width);
          firstPageH = Math.round(vp.height);
        } catch { /* can't read encrypted details */ }
        finally { await pdfjs?.destroy?.(); }
      } else {
        throw pdfLibErr;
      }
    }
    if (!currentJob(token)) return;

    const inchW = firstPageW ? (firstPageW / 72).toFixed(2) : '—';
    const inchH = firstPageH ? (firstPageH / 72).toFixed(2) : '—';
    const pdfVersion = (() => {
      const hdr = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 8));
      return hdr.match(/^%PDF-(\d+\.\d+)/)?.[1] || 'unknown';
    })();

    const titleEl = $('#result-title');
    if (titleEl) { titleEl.textContent = 'PDF properties'; titleEl.setAttribute('tabindex', '-1'); }
    const detailEl = $('#result-detail');
    if (detailEl) detailEl.textContent = isEncrypted ? 'This PDF is password-protected. Some properties could not be read.' : 'Properties read in your browser — file not changed.';
    const statsEl = $('#result-stats');
    if (statsEl) {
      const rows = [
        `File: ${escapeHtml(file.name)}`,
        `Size: ${fmtBytes(file.size)}`,
        `Pages: ${pages || 'unknown'}`,
        `PDF version: ${pdfVersion}`,
        `Encrypted: ${isEncrypted ? 'Yes — password required' : 'No'}`,
        firstPageW ? `First page: ${firstPageW} × ${firstPageH} pt (${inchW}" × ${inchH}")` : null,
        title ? `Title: ${escapeHtml(title)}` : null,
        author ? `Author: ${escapeHtml(author)}` : null,
        subject ? `Subject: ${escapeHtml(subject)}` : null,
        creator ? `Creator: ${escapeHtml(creator)}` : null,
        producer ? `Producer: ${escapeHtml(producer)}` : null
      ].filter(Boolean);
      statsEl.innerHTML = rows.map(r => `<span>${r}</span>`).join('');
    }
    const iconEl = $('#result-icon');
    if (iconEl) { iconEl.textContent = isEncrypted ? '!' : '✓'; iconEl.className = `result-icon${isEncrypted ? ' danger' : ''}`; }
    const link = $('#download-result');
    if (link) { link.classList.add('hidden'); link.removeAttribute('href'); link.removeAttribute('download'); link.setAttribute('aria-disabled', 'true'); }
    const card = $('#result-card');
    card?.classList.add('show');
    setStatus(isEncrypted ? 'PDF is encrypted. Use Unlock PDF to remove the password.' : `${pages} page${pages === 1 ? '' : 's'} · ${fmtBytes(file.size)}`, isEncrypted ? 'info' : 'success');
    requestAnimationFrame(() => { titleEl?.focus({ preventScroll: true }); card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  } catch (err) {
    if (currentJob(token)) setStatus(friendlyError(err, 'Could not read this PDF.'), 'error');
  } finally {
    if (currentJob(token)) setBusy(button, false);
  }
}

function initTool() {
  const tool = document.body.dataset.tool;
  if (!tool) return;
  initDropzone();
  $('#read-metadata-btn')?.addEventListener('click', async () => {
    const file = window.selectedFiles?.[0];
    if (!file) { setStatus('Choose a PDF first.', 'error'); return; }
    const token = nextJob();
    setBusy($('#read-metadata-btn'), true, 'Reading…');
    clearStatus();
    try {
      if (file.size > 45 * 1024 * 1024) throw new Error('This version supports PDF files up to 45 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      assertRealFile(file, bytes);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      if (!currentJob(token)) return;
      const values = {
        '#meta-title': doc.getTitle(), '#meta-author': doc.getAuthor(), '#meta-subject': doc.getSubject(),
        '#meta-keywords': doc.getKeywords(), '#meta-creator': doc.getCreator(), '#meta-producer': doc.getProducer()
      };
      for (const [selector, value] of Object.entries(values)) {
        const field = $(selector);
        if (field) field.value = value || '';
      }
      setStatus('Current metadata loaded into the fields. Edit it, then click Save metadata.', 'success');
    } catch (error) {
      if (currentJob(token)) setStatus(friendlyError(error, 'Could not read this PDF.'), 'error');
    } finally {
      if (currentJob(token)) setBusy($('#read-metadata-btn'), false);
    }
  });
  const toolControls = [...document.querySelectorAll('.tool-panel input, .tool-panel select, .tool-panel textarea')];
  const controlDefaults = new Map(toolControls.map(el => [el, el.type === 'checkbox' ? el.checked : el.value]));
  let launching = false;
  const run = async () => {
    if (launching || $('#process-btn')?.disabled) return;
    launching = true;
    try {
      if (proToolIds.has(tool)) {
        setStatus('Loading the processing engine…', 'info');
        let runner;
        try { runner = await getProRunner(); }
        catch (error) { setStatus(friendlyError(error, 'Could not load the processing engine. Reload the page and try again.'), 'error'); return; }
        if (await runner(tool)) return;
      }
      if (tool === 'image-compressor') return imageProcess('compress');
      if (tool === 'image-resizer') return imageProcess('resize');
      if (tool === 'photo-signature-resizer') return imageProcess('photo');
      if (tool === 'image-converter') return imageProcess('convert');
      if (tool === 'file-checker') return checkFile();
      if (tool === 'pdf-compressor') return compressPdf();
      if (tool === 'merge-pdf') return mergePdfs();
      if (tool === 'split-pdf') return splitPdf();
      if (tool === 'rotate-pdf') return rotatePdf();
      if (tool === 'jpg-to-pdf') return imagesToPdf();
      if (tool === 'pdf-to-jpg') return pdfToImages();
      if (tool === 'pdf-info') return showPdfInfo();
    } finally {
      launching = false;
    }
  };
  $('#process-btn')?.addEventListener('click', run);
  $('.tool-panel')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.closest('textarea, button, a')) return;
    e.preventDefault();
    run();
  });
  /* Advanced/manual toggle and visual file ordering */
  initAdvancedToggle();
  initMergeList();
  /* A cancel control for long-running local jobs. It invalidates the active
     job token; every processing loop checks that token before continuing. */
  const clearButton = $('#clear-btn');
  if (clearButton && !$('#cancel-btn')) {
    const cancelButton = document.createElement('button');
    cancelButton.id = 'cancel-btn';
    cancelButton.className = 'btn-quiet';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    clearButton.after(cancelButton);
  }
  $('#cancel-btn')?.addEventListener('click', () => {
    nextJob();
    setBusy($('#process-btn'), false);
    setStatus('Cancelled. Nothing further was processed; your original files are unchanged.', 'info');
  });
  clearButton?.addEventListener('click', () => {
    nextJob();
    setBusy($('#process-btn'), false);
    window.selectedFiles = [];
    const input = $('#file-input');
    if (input) input.value = '';
    const label = $('#dropzone-label');
    if (label) label.textContent = window.originalDropzoneLabel || 'Drop your file here';
    const sub = $('#dropzone-sub');
    if (sub) sub.textContent = window.originalDropzoneSub || 'or browse files from your device';
    syncFileList([]);
    renderMergeList();
    renderBatchGrid([]);
    for (const [el, value] of controlDefaults) {
      if (el.type === 'checkbox') el.checked = value;
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    /* Destroy workspace and clear its container */
    destroyWorkspace();
    resetResult();
    clearStatus();
  });
}

async function initGuides() {
  const target = $('#dynamic-guides');
  if (!target) return;
  try {
    /* Skip the CMS request when the backend has no database; static cards stay visible. */
    const health = await fetch('/api/health');
    if (!health.ok || (await health.json()).database === 'not-configured') return;
    const response = await fetch('/api/guides');
    if (!response.ok) throw new Error('CMS unavailable');
    const data = await response.json();
    if (data.guides?.length) {
      target.insertAdjacentHTML('beforeend', data.guides.map(g => `<article class="guide-card"><span>${escapeHtml(g.category || 'Guide')}</span><h3>${escapeHtml(g.title)}</h3><p>${escapeHtml(g.excerpt)}</p><a href="/guides/article.html?slug=${encodeURIComponent(g.slug)}">Read guide →</a></article>`).join(''));
    }
  } catch { /* Static guide cards remain visible when the CMS is unavailable. */ }
}

async function initGuideArticle() {
  if (!document.body.dataset.guideArticle) return;
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    $('#article-title').textContent = 'Choose a guide';
    $('#article-body').textContent = 'Pick a guide from the guides page to read it here.';
    return;
  }
  try {
    const health = await fetch('/api/health');
    if (!health.ok || (await health.json()).database === 'not-configured') {
      $('#article-title').textContent = 'Guide not available here';
      $('#article-body').textContent = 'This guide is not available on this site right now. Browse the guides page for other help.';
      return;
    }
    const response = await fetch(`/api/guides/${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error('This guide is not available.');
    const { guide } = await response.json();
    $('#article-title').textContent = guide.title;
    $('#article-excerpt').textContent = guide.excerpt;
    const paragraphs = String(guide.body || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replaceAll('\n', '<br>')}</p>`).join('');
    $('#article-body').innerHTML = paragraphs;
    document.title = guide.seoTitle || `${guide.title} | KriXo`;
    const meta = $('meta[name="description"]');
    if (meta && guide.seoDescription) meta.content = guide.seoDescription;
  } catch {
    $('#article-title').textContent = 'Guide not available right now';
    $('#article-body').textContent = 'This guide could not be loaded. Please try again shortly.';
  }
}

function initContact() {
  const form = $('#feedback-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = $('#feedback-status');
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send feedback. Please try again.');
      status.textContent = body.message || 'Thanks — your feedback has been received.';
      status.className = 'tool-status show success';
      status.setAttribute('role', 'status');
      form.reset();
    } catch (err) {
      const detail = String(err.message || 'Could not send feedback. Please try again.').replace(/\.?$/, '.');
      status.textContent = `${detail} If this keeps happening, email hello@krixo.com.`;
      status.className = 'tool-status show error';
      status.setAttribute('role', 'alert');
    } finally { if (button) button.disabled = false; }
  });
}

function initAdmin() {
  if (!document.body.dataset.admin) return;
  const login = $('#admin-login-form');
  const panel = $('#admin-panel');
  const loginBox = $('#admin-login-box');
  const message = $('#admin-message');
  const api = async (url, options = {}) => {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };
  async function loadSummary() {
    const d = await api('/api/admin/summary');
    $('#admin-summary').innerHTML = `<div class="admin-row"><strong>Guides</strong><span>${escapeHtml(d.guides)}</span></div><div class="admin-row"><strong>Presets</strong><span>${escapeHtml(d.presets)}</span></div><div class="admin-row"><strong>New feedback</strong><span>${escapeHtml(d.newFeedback)}</span></div>`;
  }
  async function refreshGuides() {
    try {
      const d = await api('/api/admin/guides');
      $('#admin-guides-list').innerHTML = d.guides.map(g => `<div class="admin-row"><span><strong>${escapeHtml(g.title)}</strong><br><small>/${escapeHtml(g.slug)} · ${g.published ? 'Published' : 'Draft'}</small></span><button type="button" data-delete-guide="${escapeHtml(g._id)}">Delete</button></div>`).join('') || '<p class="muted-note">No guides saved yet.</p>';
    } catch (err) { $('#admin-guides-list').textContent = err.message; }
  }
  async function refreshPresets() {
    try {
      const d = await api('/api/admin/presets');
      $('#admin-presets-list').innerHTML = d.presets.map(p => `<div class="admin-row"><span><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.category)} · ${escapeHtml(p.width || '—')}×${escapeHtml(p.height || '—')} px · max ${escapeHtml(p.maxKB)} KB · ${p.published ? 'Published' : 'Draft'}</small></span><button type="button" data-delete-preset="${escapeHtml(p._id)}">Delete</button></div>`).join('') || '<p class="muted-note">No presets saved yet.</p>';
    } catch (err) { $('#admin-presets-list').textContent = err.message; }
  }
  async function refreshFeedback() {
    try {
      const d = await api('/api/admin/feedback');
      $('#feedback-list').innerHTML = d.feedback.map(f => `<div class="admin-row"><span><strong>${escapeHtml(f.type)}</strong> · ${escapeHtml(f.message)}<br><small>${escapeHtml(f.name || 'Anonymous')} · ${escapeHtml(f.email || 'No email')} · ${new Date(f.createdAt).toLocaleString()}</small></span><span>${escapeHtml(f.status)}<br><button type="button" data-feedback-status="reviewed" data-feedback-id="${escapeHtml(f._id)}">Review</button> <button type="button" data-feedback-status="closed" data-feedback-id="${escapeHtml(f._id)}">Close</button></span></div>`).join('') || '<p class="muted-note">No feedback yet.</p>';
    } catch (err) { $('#feedback-list').textContent = err.message; }
  }
  async function showPanel() {
    loginBox.classList.add('hidden');
    panel.classList.remove('hidden');
    await loadSummary();
    await Promise.all([refreshGuides(), refreshPresets(), refreshFeedback()]);
  }
  login?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: $('#admin-email').value, password: $('#admin-password').value }) });
      message.textContent = 'Signed in.';
      await showPanel();
    } catch (err) { message.textContent = err.message; }
  });
  (async () => {
    try {
      const health = await fetch('/api/health').then(res => res.ok ? res.json() : {}).catch(() => ({}));
      if (health.database === 'not-configured') {
        message.textContent = 'Admin sign-in is not available right now. Please try again later.';
        return;
      }
      const session = await api('/api/admin/me');
      if (session.admin) await showPanel();
    } catch (err) {
      if (!/sign in|session expired/i.test(err.message)) message.textContent = 'We could not check your session. Please try again.';
    }
  })();
  $('#admin-logout')?.addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); }
    catch (err) { message.textContent = err.message; return; }
    panel.classList.add('hidden');
    loginBox.classList.remove('hidden');
  });
  $$('.admin-tabs button').forEach(btn => btn.addEventListener('click', () => {
    $$('.admin-tabs button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    $$('[data-admin-section]').forEach(s => s.classList.add('hidden'));
    $(`[data-admin-section="${btn.dataset.section}"]`)?.classList.remove('hidden');
  }));
  $('#guide-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    d.published = $('#guide-published')?.checked || false;
    try { await api('/api/admin/guides', { method: 'POST', body: JSON.stringify(d) }); $('#guide-message').textContent = 'Guide saved.'; e.currentTarget.reset(); await refreshGuides(); }
    catch (err) { $('#guide-message').textContent = err.message; }
  });
  $('#preset-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    d.published = $('#preset-published')?.checked || false;
    try { await api('/api/admin/presets', { method: 'POST', body: JSON.stringify(d) }); $('#preset-message').textContent = 'Preset saved. Publish only after checking the current official notice.'; e.currentTarget.reset(); await refreshPresets(); }
    catch (err) { $('#preset-message').textContent = err.message; }
  });
  $('#refresh-guides')?.addEventListener('click', refreshGuides);
  $('#refresh-presets')?.addEventListener('click', refreshPresets);
  $('#refresh-feedback')?.addEventListener('click', refreshFeedback);
  $('#admin-guides-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-delete-guide]');
    if (!btn || !confirm('Delete this guide?')) return;
    try { await api(`/api/admin/guides/${btn.dataset.deleteGuide}`, { method: 'DELETE' }); await refreshGuides(); }
    catch (err) { $('#guide-message').textContent = err.message; }
  });
  $('#admin-presets-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-delete-preset]');
    if (!btn || !confirm('Delete this preset?')) return;
    try { await api(`/api/admin/presets/${btn.dataset.deletePreset}`, { method: 'DELETE' }); await refreshPresets(); }
    catch (err) { $('#preset-message').textContent = err.message; }
  });
  $('#feedback-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-feedback-status]');
    if (!btn) return;
    try { await api(`/api/admin/feedback/${btn.dataset.feedbackId}`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.feedbackStatus }) }); await refreshFeedback(); }
    catch (err) { $('#feedback-list').textContent = err.message; }
  });
}

renderShell();
initHome();
initTool();
initGuides();
initGuideArticle();
initContact();
initAdmin();
