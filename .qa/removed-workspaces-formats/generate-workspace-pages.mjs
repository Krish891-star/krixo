import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaces } from '../public/assets/workspaces.js';
import { toolById } from '../public/assets/tool-manifest.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspacesDir = path.join(rootDir, 'public', 'workspaces');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function page({ title, description, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f7f2"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="icon" href="/favicon.png"><link rel="alternate icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/styles.css"><script type="module" src="/assets/main.js"></script><script type="module" src="/assets/seo.js"></script></head><body><header id="site-header"></header><main>${body}</main><footer id="site-footer"></footer></body></html>\n`;
}

function breadcrumb(label) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/workspaces/">Workspaces</a> / ${esc(label)}</nav>`;
}

function toolCard(id) {
  const tool = toolById.get(id);
  if (!tool) return '';
  return `<a class="tool-card" href="${tool.href}"><h3>${esc(tool.name)}</h3><p>${esc(tool.desc)}</p></a>`;
}

const workspaceIds = workspaces.map(ws => ws.id);
const assignedTools = workspaces.flatMap(ws => ws.tools);
if (new Set(workspaceIds).size !== workspaceIds.length) throw new Error('Duplicate workspace id in workspaces.js');
if (new Set(assignedTools).size !== assignedTools.length) throw new Error('A tool is assigned to more than one workspace in workspaces.js');
for (const id of assignedTools) if (!toolById.has(id)) throw new Error(`Workspace references unknown tool: ${id}`);
for (const ws of workspaces) {
  for (const href of [ws.href, ...(ws.also || []).map(item => item.href)]) {
    if (!existsSync(path.join(rootDir, 'public', String(href).replace(/^\/+/, '')))) {
      throw new Error(`Workspace ${ws.id} links to missing page: ${href}`);
    }
  }
  for (const id of ws.tools) {
    const href = toolById.get(id)?.href;
    if (href && !existsSync(path.join(rootDir, 'public', String(href).replace(/^\/+/, '')))) {
      throw new Error(`Workspace ${ws.id} links to missing tool page: ${href}`);
    }
  }
}

const workspaceCards = workspaces.map(ws => `<a class="tool-card" href="${ws.href}"><h3>${esc(ws.name)}</h3><p>${esc(ws.summary)}</p></a>`).join('');

const indexHtml = page({
  title: 'Workspaces — KriXo',
  description: 'Eight task-focused KriXo workspaces for PDF pages, editing, images, conversion, security, inspection, optimization and combining files.',
  body: `<section class="shell page-hero">${breadcrumb('All workspaces')}<span class="eyebrow"><i class="eyebrow-dot" aria-hidden="true"></i> Workspaces</span><h1>Work around the job, not the file type.</h1><p>Each workspace groups the tools that belong together. Every tool keeps its own direct URL and stays visible in the full tool list.</p></section><section class="shell section"><div class="tool-grid">${workspaceCards}</div></section>`
});

await mkdir(workspacesDir, { recursive: true });
await writeFile(path.join(workspacesDir, 'index.html'), indexHtml, 'utf8');

for (const ws of workspaces) {
  const toolCards = ws.tools.map(toolCard).filter(Boolean).join('');
  const related = (ws.also || []).map(item => `<a class="feature-link" href="${item.href}">${esc(item.label)} ↗</a>`).join(' ');
  const body = `<section class="shell page-hero">${breadcrumb(ws.name)}<span class="eyebrow"><i class="eyebrow-dot" aria-hidden="true"></i> ${esc(ws.name)}</span><h1>${esc(ws.name)}</h1><p>${esc(ws.summary)}</p></section><section class="shell section"><div class="section-head"><div><span class="section-kicker">Tools in this workspace</span><h2>Pick what you need.</h2></div><p>All files are processed in your browser. Manual controls remain available on every tool page.</p></div><div class="tool-grid">${toolCards}</div>${related ? `<div class="action-row">${related}</div>` : ''}</section><section class="shell section"><div class="notice warning"><strong>Output contract:</strong> ${esc(ws.note || '')}</div></section>`;
  await writeFile(path.join(workspacesDir, `${ws.id}.html`), page({
    title: `${ws.name} — KriXo`,
    description: ws.summary,
    body
  }), 'utf8');
}

const formats = [
  ['PDF', 'Fully supported', 'Merge, split, rotate, crop, reorganise, stamp, compress, inspect and export pages.'],
  ['JPG / PNG / WebP', 'Fully supported', 'Image input and output for compress, resize, convert and images-to-PDF.'],
  ['GIF / BMP', 'Partial', 'Accepted as image input; canvas conversion uses the first frame only.'],
  ['DOCX', 'Partial', 'DOCX to PDF uses mammoth; PDF to DOCX is a text-based editable reconstruction.'],
  ['XLSX / XLS / CSV', 'Partial', 'Spreadsheets to PDF use SheetJS; PDF to XLSX uses text and column heuristics.'],
  ['PPTX', 'Partial', 'PPTX to PDF rebuilds slides from OOXML; PDF to PPTX creates positioned text/image slides.'],
  ['HTML / TXT / Markdown', 'Supported', 'Paste or upload HTML/TXT for PDF; PDF to Markdown exports selectable text.'],
  ['Tesseract OCR languages', 'Partial', 'English only, downloads language data on first use, limited to 20 pages per run.'],
  ['DOC / ODT / RTF / ODS / PPT / ODP', 'Not supported', 'No native office engine is available in this browser build. Convert to DOCX/XLSX/PPTX first.'],
  ['AVIF / TIFF / HEIC / SVG', 'Not supported', 'Not accepted as reliable conversion paths. Convert to JPG or PNG first.'],
  ['Encrypted PDFs', 'Partial', 'Unlock requires a password you already know; most other tools need an unlocked PDF.'],
  ['Certified PDF/A / cryptographic signatures', 'Not supported', 'PDF/A Preparation is metadata cleanup only; signatures are visual images.']
];

const formatRows = formats.map(([format, status, note]) => {
  const cls = status === 'Fully supported' ? 'check-pass' : status === 'Not supported' ? 'check-fail' : '';
  return `<tr><td>${esc(format)}</td><td class="${cls}">${esc(status)}</td><td>${esc(note)}</td></tr>`;
}).join('');

const formatsHtml = page({
  title: 'Supported Formats — KriXo',
  description: 'An honest matrix of formats KriXo fully supports, partially supports and does not support in its browser-only build.',
  body: `<section class="shell page-hero">${breadcrumb('Formats')}<span class="eyebrow"><i class="eyebrow-dot" aria-hidden="true"></i> Format matrix</span><h1>What KriXo really supports.</h1><p>We would rather tell you the limits upfront than show a successful download with a broken result. Everything below reflects the current browser-only build.</p></section><section class="shell section"><div class="notice warning"><strong>Privacy note:</strong> your input files are not uploaded to a processing server. Page scripts, fonts, WASM modules and OCR language data may still be downloaded by your browser.</div><table class="format-table"><thead><tr><th scope="col">Format</th><th scope="col">Support</th><th scope="col">What that means</th></tr></thead><tbody>${formatRows}</tbody></table></section>`
});

await writeFile(path.join(rootDir, 'public', 'formats.html'), formatsHtml, 'utf8');
console.log(`Generated ${workspaces.length + 1} workspace pages and formats.html.`);
