/* Shared helpers for the document and advanced PDF tools.
   All processing happens in the browser; no uploaded file leaves the device. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { assertRealFile } from './file-validation.js';

export const MAX_INPUT_BYTES = 45 * 1024 * 1024;

export function assertInputSize(file, max = MAX_INPUT_BYTES) {
  if (file.size > max) throw new Error(`This tool supports files up to ${Math.round(max / 1024 / 1024)} MB. Try a smaller copy.`);
  if (!file.size) throw new Error('That file is empty. Choose a different file.');
}

/* PDF.js can stall on unusual page content. Always give the user a clear failure. */
export function withTimeout(promise, ms = 60000, message = 'This file took too long to process. Try a smaller or simpler file.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function extensionOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

export function assertExtension(file, extensions, label) {
  const ext = extensionOf(file.name);
  if (!extensions.includes(ext)) {
    throw new Error(`${label || 'This tool'} supports ${extensions.map(e => `.${e}`).join(', ')} files. Your file ends in .${ext || '?'}.`);
  }
}

export async function bytesOf(file) {
  assertInputSize(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertRealFile(file, bytes);
  return bytes;
}

export async function openPdf(file) {
  const bytes = await bytesOf(file);
  return { bytes, doc: await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }) };
}

export async function savePdf(doc) {
  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}

export function parsePageList(value, total) {
  const raw = String(value ?? '').trim();
  if (!raw) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set();
  for (const part of raw.split(/[\s,]+/).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`"${part}" is not a page number or range. Use values like 1,3-5.`);
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to > total || from > to) throw new Error(`Pages ${part} are outside this file (1-${total}).`);
    for (let i = from; i <= to; i++) pages.add(i - 1);
  }
  if (!pages.size) throw new Error('Choose at least one page.');
  return [...pages].sort((a, b) => a - b);
}

export function baseName(name) {
  return String(name || 'output').replace(/\.[^.]+$/, '') || 'output';
}

export function safeName(name) {
  return baseName(name).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'output';
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,select,textarea,link,meta,base').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      // Control characters are stripped by browsers before scheme checks, so remove them here too.
      const value = String(attr.value || '').replace(/[\u0000-\u0020]/g, '').trim();
      if (/^on/i.test(attr.name)) { el.removeAttribute(attr.name); return; }
      if (attr.name === 'href' || attr.name === 'src' || attr.name === 'xlink:href') {
        const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
        const isImageData = /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value);
        if (attr.name === 'src' || attr.name === 'xlink:href') {
          // Images are never fetched from a remote host: keep processing local and avoid tainted canvases.
          if (scheme && !isImageData) el.removeAttribute(attr.name);
          else if (!scheme && /^\/\//.test(value)) el.removeAttribute(attr.name);
        } else if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) {
          el.removeAttribute(attr.name);
        } else if (!scheme && /^\/\//.test(value)) {
          el.removeAttribute(attr.name);
        }
        return;
      }
      if (attr.name === 'style' && /url\s*\(/i.test(value) && !/url\s*\(\s*['"]?\s*data:image\//i.test(value)) el.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

/* Rasterises sanitised HTML into a paginated A4 PDF. Used by Word, HTML and similar converters. */
export async function htmlToPdfBytes(html, { title = 'Converted document' } = {}) {
  const holder = document.createElement('div');
  holder.setAttribute('data-krixo-render', '');
  holder.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;min-height:1123px;box-sizing:border-box;padding:48px 56px;background:#fff;color:#111;font:15px/1.55 Arial,Helvetica,sans-serif;white-space:normal;';
  holder.innerHTML = `<h1 style="font-size:22px;margin:0 0 18px;padding-bottom:12px;border-bottom:1px solid #ddd;">${escapeHtmlText(title)}</h1>${sanitizeHtml(html)}`;
  document.body.appendChild(holder);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: false, windowWidth: 1100 });
    if (!canvas.width || !canvas.height) throw new Error('The document could not be rendered. Try a simpler file.');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = canvas.height * imgW / canvas.width;
    if (!Number.isFinite(imgH) || imgH <= 0) throw new Error('The document could not be measured. Try a simpler file.');
    const data = canvas.toDataURL('image/jpeg', 0.94);
    let offset = 0;
    let first = true;
    while (offset < imgH - 1) {
      if (!first) pdf.addPage();
      pdf.addImage(data, 'JPEG', 0, -offset, imgW, imgH, undefined, 'FAST');
      offset += pageH;
      first = false;
      if (pdf.getNumberOfPages() > 200) throw new Error('This document is longer than 200 pages. Split it into smaller parts and try again.');
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    holder.remove();
  }
}

export function escapeHtmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Extracts positioned text items grouped into lines. Shared by PDF → Word/Excel/PowerPoint. */
export async function extractPdfText(bytes) {
  const pdf = await withTimeout(pdfjsLib.getDocument({ data: bytes.slice(0), disableWorker: true }).promise, 60000, 'This PDF took too long to open. Try a smaller or simpler file.');
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const rows = [];
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        // PDF.js reports positions in unrotated user space; apply the viewport transform
        // so rotated pages keep their reading order and placement.
        const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = transform[4];
        const y = transform[5];
        const height = Math.hypot(transform[2], transform[3]) || item.height || 10;
        let row = null;
        for (let i = rows.length - 1; i >= 0 && rows.length - i <= 12; i--) {
          if (Math.abs(rows[i].y - y) < Math.max(3, height * 0.4)) { row = rows[i]; break; }
        }
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ text: String(item.str).replace(/\s+/g, ' '), x, width: item.width || 0, height });
      }
      rows.sort((a, b) => b.y - a.y);
      const lines = rows.map(row => {
        row.items.sort((a, b) => a.x - b.x);
        let text = '';
        let previousRight = null;
        for (const item of row.items) {
          if (text && previousRight !== null) {
            const gap = item.x - previousRight;
            // Keep wide column gaps as tabs so Excel conversion can create separate cells.
            text += gap > Math.max(8, item.height * 1.6) ? '\t' : ' ';
          }
          text += item.text;
          previousRight = item.x + item.width;
        }
        return { y: row.y, x: row.items[0]?.x || 0, text: text.trim(), items: row.items };
      }).filter(line => line.text);
      pages.push({ number, width: viewport.width, height: viewport.height, lines });
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

const MAX_CANVAS_SIDE = 4096;

async function renderPageOnDocument(pdf, pageNumber, scale = 1.5) {
  const page = await pdf.getPage(pageNumber);
  let effectiveScale = scale;
  let viewport = page.getViewport({ scale: effectiveScale });
  const longest = Math.max(viewport.width, viewport.height);
  if (longest > MAX_CANVAS_SIDE) {
    effectiveScale *= MAX_CANVAS_SIDE / longest;
    viewport = page.getViewport({ scale: effectiveScale });
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser could not create a canvas for this page. Try a smaller file.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, 60000, 'A page in this PDF could not be rendered. Try a different PDF.');
  return { canvas, viewport };
}

export async function renderPdfPage(bytes, pageNumber, scale = 1.5) {
  const pdf = await withTimeout(pdfjsLib.getDocument({ data: bytes.slice(0), disableWorker: true }).promise, 60000, 'This PDF took too long to open. Try a smaller or simpler file.');
  try {
    return (await renderPageOnDocument(pdf, pageNumber, scale)).canvas;
  } finally {
    await pdf.destroy();
  }
}

/* Render several pages from one PDF load; keeps the exact viewport so callers can map
   PDF coordinates (crop box and rotation included) onto the rendered pixels. */
export async function renderPdfPagesDetailed(bytes, pageNumbers, scale = 1.5) {
  const pdf = await withTimeout(pdfjsLib.getDocument({ data: bytes.slice(0), disableWorker: true }).promise, 60000, 'This PDF took too long to open. Try a smaller or simpler file.');
  const rendered = new Map();
  try {
    for (const number of pageNumbers) rendered.set(number, await renderPageOnDocument(pdf, number, scale));
    return rendered;
  } finally {
    await pdf.destroy();
  }
}

/* Render several pages from one PDF load; much faster and lighter than re-opening per page. */
export async function renderPdfPages(bytes, pageNumbers, scale = 1.5) {
  const rendered = await renderPdfPagesDetailed(bytes, pageNumbers, scale);
  const canvases = new Map();
  for (const [number, entry] of rendered) canvases.set(number, entry.canvas);
  return canvases;
}

export function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function standardFont(doc) {
  return doc.embedFont(StandardFonts.Helvetica);
}

export function pdfTextColor(hex) {
  const value = String(hex || '#111827').replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return rgb(0.07, 0.09, 0.16);
  return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
}
