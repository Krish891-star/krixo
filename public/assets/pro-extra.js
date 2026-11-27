/* Additional browser-only KriXo tools. No file contents leave the device. */
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  assertExtension,
  assertInputSize,
  bytesOf,
  openPdf,
  savePdf,
  parsePageList,
  baseName,
  safeName,
  extractPdfText,
  withTimeout,
  renderPdfPagesDetailed,
  escapeHtmlText
} from './pro-core.js';

const PDF_MIME = 'application/pdf';
const MAX_CANVAS_SIDE = 4096;
const MAX_RASTER_PAGES = 20;
const MAX_RASTER_PIXELS = 120 * 1024 * 1024;

function inputValue(ctx, selector, fallback = '') {
  const raw = ctx.$(selector)?.value;
  const value = raw == null ? '' : String(raw).trim();
  return value || fallback;
}

function isChecked(ctx, selector) {
  return Boolean(ctx.$(selector)?.checked);
}

function numberValue(ctx, selector, fallback, { min = 0, max = Infinity, integer = false, label = selector.replace('#', '') } = {}) {
  const raw = inputValue(ctx, selector, '');
  if (!raw) return fallback;
  const value = Number(raw);
  const valid = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  if (!valid) throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max === Infinity ? 'any value' : max}.`);
  return value;
}

function requirePdf(ctx, label) {
  const files = ctx.files?.length ? ctx.files : ctx.requireFiles?.();
  const file = ctx.file || files?.[0];
  if (!file) throw new Error('Choose a file first.');
  assertExtension(file, ['pdf'], label || 'This tool');
  assertInputSize(file);
  return file;
}

function deliver(ctx, { bytes, mime, filename, detail, stats = [], preview }) {
  if (!ctx.isCurrent()) return;
  ctx.showResult({
    title: 'Your file is ready',
    detail,
    url: URL.createObjectURL(new Blob([bytes], { type: mime })),
    filename,
    stats,
    preview
  });
}

function textBytes(text) {
  return new TextEncoder().encode(String(text || ''));
}

function pageText(pages, { headings = true } = {}) {
  return pages.map(page => {
    const lines = page.lines.map(line => line.text).join('\n');
    return headings ? `Page ${page.number}\n${'-'.repeat(9)}\n${lines}` : lines;
  }).join('\n\n');
}

function canvasJpegBytes(canvas, quality = 0.9) {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = /^data:[^,]*;base64,(.*)$/.exec(dataUrl)?.[1];
  if (!base64) throw new Error('A rendered page could not be encoded. Try a smaller PDF.');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseBoxes(raw, max = 20) {
  const source = String(raw || '').trim();
  if (!source) throw new Error('Add at least one redaction box before processing.');
  const boxes = [];
  for (const chunk of source.split(/[;\n]+/).map(part => part.trim()).filter(Boolean)) {
    const parts = chunk.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length !== 4 || parts.some(value => !Number.isFinite(value))) {
      throw new Error(`"${chunk.slice(0, 40)}" is not a valid box. Use x1,y1,x2,y2.`);
    }
    const [x1, y1, x2, y2] = parts;
    if (x2 <= x1 || y2 <= y1) throw new Error('A box must use x2 greater than x1 and y2 greater than y1.');
    if (boxes.length >= max) throw new Error(`This version supports up to ${max} boxes per page.`);
    boxes.push({ x1, y1, x2, y2 });
  }
  return boxes;
}

/* Boxes are entered in PDF points. Map them through the exact pdf.js viewport used
   for rendering so crop boxes and page rotation cannot shift a redaction off target. */
function applyBoxes(canvas, boxes, viewport) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  const project = (x, y) => {
    const matrix = pdfjsLib.Util.transform(viewport.transform, [1, 0, 0, 1, x, y]);
    return { x: matrix[4], y: matrix[5] };
  };
  for (const box of boxes) {
    const a = project(box.x1, box.y1);
    const b = project(box.x2, box.y2);
    const x = Math.max(0, Math.min(canvas.width, Math.min(a.x, b.x)));
    const x2 = Math.max(0, Math.min(canvas.width, Math.max(a.x, b.x)));
    const y = Math.max(0, Math.min(canvas.height, Math.min(a.y, b.y)));
    const y2 = Math.max(0, Math.min(canvas.height, Math.max(a.y, b.y)));
    if (x2 > x && y2 > y) ctx.fillRect(x, y, x2 - x, y2 - y);
  }
}

function grayscaleCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
  ctx.putImageData(image, 0, 0);
}

async function buildRasterPdf(ctx, { label, mode = 'color', boxes = [], scale = 1.5 }) {
  const file = requirePdf(ctx, label);
  ctx.setStatus(`Opening ${file.name}…`, 'info');
  const bytes = await bytesOf(file);
  if (!ctx.isCurrent()) return null;

  const probe = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: false, updateMetadata: false });
  const total = probe.getPageCount();
  const pages = parsePageList(inputValue(ctx, '#pages'), total);
  if (pages.length > MAX_RASTER_PAGES) throw new Error(`This version processes up to ${MAX_RASTER_PAGES} pages at a time. Enter a smaller page range.`);
  let estimatedPixels = 0;
  for (const index of pages) {
    const { width, height } = probe.getPage(index).getSize();
    estimatedPixels += Math.min(MAX_CANVAS_SIDE, width * scale) * Math.min(MAX_CANVAS_SIDE, height * scale);
  }
  if (estimatedPixels > MAX_RASTER_PIXELS) throw new Error('These pages would use too much browser memory at this quality. Choose fewer pages or a lower quality.');
  if (!ctx.isCurrent()) return null;

  ctx.setStatus(`Rendering ${pages.length} page${pages.length === 1 ? '' : 's'} locally…`, 'info');
  const rendered = await renderPdfPagesDetailed(bytes, pages.map(index => index + 1), scale);
  if (!ctx.isCurrent()) return null;

  const output = await PDFDocument.create();
  for (const index of pages) {
    if (!ctx.isCurrent()) return null;
    const entry = rendered.get(index + 1);
    if (!entry) throw new Error(`Page ${index + 1} could not be rendered. Try a different file.`);
    const { canvas, viewport } = entry;
    // Use the rendered viewport (crop box + rotation), not the raw MediaBox size.
    const width = viewport.width / viewport.scale;
    const height = viewport.height / viewport.scale;
    if (mode === 'grayscale') grayscaleCanvas(canvas);
    if (boxes.length) applyBoxes(canvas, boxes, viewport);
    const embedded = await output.embedJpg(canvasJpegBytes(canvas));
    const page = output.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }
  output.setTitle(`${safeName(file.name)} - ${mode === 'grayscale' ? 'grayscale' : mode === 'redacted' ? 'redacted' : 'flattened'}`);
  output.setProducer('KriXo');
  const result = await savePdf(output);
  return { file, result, total, pages };
}

function splitTextLines(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function diffLines(left, right) {
  const a = left.slice(0, 1500);
  const b = right.slice(0, 1500);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { ops.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) { ops.push({ type: 'remove', text: a[i] }); i++; }
    else { ops.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < a.length) { ops.push({ type: 'remove', text: a[i++] }); }
  while (j < b.length) { ops.push({ type: 'add', text: b[j++] }); }
  return { ops, truncated: left.length > a.length || right.length > b.length };
}

function comparisonReport(firstName, secondName, { ops, truncated }) {
  const rows = ops.map(op => {
    const label = op.type === 'add' ? 'Only in second' : op.type === 'remove' ? 'Only in first' : 'Same';
    return `<tr class="${op.type}"><th>${label}</th><td>${escapeHtmlText(op.text)}</td></tr>`;
  }).join('');
  const changed = ops.filter(op => op.type !== 'same').length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KriXo PDF comparison</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#17211b;max-width:900px;margin:32px auto;padding:0 18px}h1{font-size:24px}p{color:#526057}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px 10px;border-bottom:1px solid #dfe6e0;text-align:left;vertical-align:top}th{width:120px;font-size:12px;text-transform:uppercase;color:#526057}.add{background:#e8f6ec}.remove{background:#fdeaea}.note{background:#fff8e6;padding:12px;border-radius:10px}</style></head><body><h1>PDF text comparison</h1><p>Generated locally by KriXo. Compared selectable text only; scanned PDFs need OCR first.</p><p><strong>First:</strong> ${escapeHtmlText(firstName)}<br><strong>Second:</strong> ${escapeHtmlText(secondName)}<br><strong>Changed lines:</strong> ${changed}</p>${truncated ? '<p class="note">Only the first 1,500 lines of each document were compared to keep the browser responsive.</p>' : ''}<table>${rows || '<tr><th>Same</th><td>No selectable text was found in either PDF.</td></tr>'}</table></body></html>`;
}

async function renderWithPassword(bytes, password, pageNumbers, scale) {
  const task = pdfjsLib.getDocument({ data: bytes.slice(0), password, disableWorker: true });
  const pdf = await withTimeout(task.promise, 60000, 'This PDF could not be opened. Check the password and try again.');
  const canvases = new Map();
  const sizes = new Map();
  try {
    for (const number of pageNumbers) {
      if (number > pdf.numPages) throw new Error('That page number is outside this PDF.');
      const page = await pdf.getPage(number);
      let viewport = page.getViewport({ scale });
      const longest = Math.max(viewport.width, viewport.height);
      if (longest > MAX_CANVAS_SIDE) {
        viewport = page.getViewport({ scale: scale * MAX_CANVAS_SIDE / longest });
      }
      sizes.set(number, page.getViewport({ scale: 1 }));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser could not create a canvas for this page.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await withTimeout(page.render({ canvasContext: context, viewport }).promise, 60000, 'A page could not be rendered. Try a smaller PDF.');
      canvases.set(number, canvas);
    }
  } finally {
    await pdf.destroy();
  }
  return { canvases, sizes };
}

export const extraHandlers = {
  'pdf-to-text': async (ctx) => {
    const file = requirePdf(ctx, 'PDF to text');
    ctx.setStatus('Extracting selectable text…', 'info');
    const pages = await extractPdfText(await bytesOf(file));
    if (!ctx.isCurrent()) return;
    const text = pageText(pages, { headings: isChecked(ctx, '#text-page-headings') });
    if (!text.replace(/Page \d+|-{6,}/g, '').trim()) throw new Error('No selectable text was found. Use OCR PDF first for scanned documents.');
    const lines = pages.reduce((sum, page) => sum + page.lines.length, 0);
    deliver(ctx, {
      bytes: textBytes(text),
      mime: 'text/plain;charset=utf-8',
      filename: `${safeName(file.name)}.txt`,
      detail: 'Text was extracted from the PDF in your browser.',
      stats: [`Pages: ${pages.length}`, `Text lines: ${lines}`]
    });
  },

  'pdf-to-markdown': async (ctx) => {
    const file = requirePdf(ctx, 'PDF to Markdown');
    ctx.setStatus('Reading PDF text…', 'info');
    const pages = await extractPdfText(await bytesOf(file));
    if (!ctx.isCurrent()) return;
    const includeHeadings = isChecked(ctx, '#markdown-page-headings');
    const cleanLines = isChecked(ctx, '#markdown-clean');
    const body = pages.map(page => {
      let lines = page.lines.map(line => line.text);
      if (cleanLines) lines = lines.filter((line, index) => line || index === 0);
      const content = lines.join('  \n');
      return includeHeadings ? `## Page ${page.number}\n\n${content}` : content;
    }).filter(part => part.trim()).join('\n\n');
    if (!body.trim()) throw new Error('No selectable text was found. Use OCR PDF first for scanned documents.');
    const markdown = `# ${baseName(file.name)}\n\n${body}\n`;
    deliver(ctx, {
      bytes: textBytes(markdown),
      mime: 'text/markdown;charset=utf-8',
      filename: `${safeName(file.name)}.md`,
      detail: 'A text-based Markdown file was created locally. Page artwork and exact layout are not preserved.',
      stats: [`Pages: ${pages.length}`, `Format: Markdown (.md)`]
    });
  },

  'compare-pdf': async (ctx) => {
    const files = ctx.files?.length ? ctx.files : ctx.requireFiles?.();
    if (!files || files.length < 2) throw new Error('Choose two PDF files to compare.');
    [files[0], files[1]].forEach((file, index) => assertExtension(file, ['pdf'], `PDF ${index + 1}`));
    if (files.length > 2) throw new Error('Compare works on the first two selected PDFs.');
    ctx.setStatus('Extracting text from both PDFs…', 'info');
    const [first, second] = await Promise.all([bytesOf(files[0]), bytesOf(files[1])]);
    const [firstPages, secondPages] = await Promise.all([extractPdfText(first), extractPdfText(second)]);
    if (!ctx.isCurrent()) return;
    const diff = diffLines(pageText(firstPages, { headings: false }), pageText(secondPages, { headings: false }));
    deliver(ctx, {
      bytes: textBytes(comparisonReport(files[0].name, files[1].name, diff)),
      mime: 'text/html;charset=utf-8',
      filename: `${safeName(files[0].name)}-compared.html`,
      detail: 'A line-by-line text comparison report was created in your browser.',
      stats: [`First: ${firstPages.length} page${firstPages.length === 1 ? '' : 's'}`, `Second: ${secondPages.length} page${secondPages.length === 1 ? '' : 's'}`, `Changed lines: ${diff.ops.filter(op => op.type !== 'same').length}`]
    });
  },

  'redact-pdf': async (ctx) => {
    const boxes = parseBoxes(inputValue(ctx, '#redaction-boxes'), 20);
    const scale = numberValue(ctx, '#redaction-quality', 1.5, { min: 1, max: 2.5, label: 'Render quality' });
    const result = await buildRasterPdf(ctx, { label: 'Redact PDF', mode: 'redacted', boxes, scale });
    if (!result || !ctx.isCurrent()) return;
    deliver(ctx, {
      bytes: result.result,
      mime: PDF_MIME,
      filename: `${safeName(result.file.name)}-redacted.pdf`,
      detail: 'Marked areas were covered before the pages were rebuilt as images. The original text underneath is not present in the downloaded PDF.',
      stats: [`Source: ${result.total} page${result.total === 1 ? '' : 's'}`, `Processed: ${result.pages.length} page${result.pages.length === 1 ? '' : 's'}`, `Boxes per page: ${boxes.length}`]
    });
  },

  'unlock-pdf': async (ctx) => {
    const file = requirePdf(ctx, 'Unlock PDF');
    const password = inputValue(ctx, '#unlock-password', '');
    const scale = numberValue(ctx, '#unlock-quality', 1.5, { min: 1, max: 2.5, label: 'Render quality' });
    ctx.setStatus(`Opening ${file.name}…`, 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    const probeTask = pdfjsLib.getDocument({ data: bytes.slice(0), password, disableWorker: true });
    const probe = await withTimeout(probeTask.promise, 60000, 'This PDF could not be opened. Check the password and try again.');
    let pageNumbers;
    try {
      pageNumbers = Array.from({ length: Math.min(probe.numPages, MAX_RASTER_PAGES) }, (_, index) => index + 1);
      if (probe.numPages > MAX_RASTER_PAGES) throw new Error(`This version processes up to ${MAX_RASTER_PAGES} pages. Use a smaller PDF.`);
    } finally {
      await probe.destroy();
    }
    if (!ctx.isCurrent()) return;
    ctx.setStatus(`Rebuilding ${pageNumbers.length} unlocked page${pageNumbers.length === 1 ? '' : 's'}…`, 'info');
    const { canvases, sizes } = await renderWithPassword(bytes, password, pageNumbers, scale);
    if (!ctx.isCurrent()) return;
    const output = await PDFDocument.create();
    for (const number of pageNumbers) {
      const size = sizes.get(number);
      const embedded = await output.embedJpg(canvasJpegBytes(canvases.get(number)));
      const page = output.addPage([size.width, size.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
    }
    output.setTitle(`${safeName(file.name)} - unlocked`);
    output.setProducer('KriXo');
    const result = await savePdf(output);
    if (!ctx.isCurrent()) return;
    deliver(ctx, {
      bytes: result,
      mime: PDF_MIME,
      filename: `${safeName(file.name)}-unlocked.pdf`,
      detail: 'A new unprotected PDF was rebuilt from the rendered pages. Selectable text, links and form fields are not preserved.',
      stats: [`Pages: ${pageNumbers.length}`, `Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(result.byteLength)}`]
    });
  },

  'flatten-pdf': async (ctx) => {
    const scale = numberValue(ctx, '#flatten-quality', 1.5, { min: 1, max: 2.5, label: 'Render quality' });
    const result = await buildRasterPdf(ctx, { label: 'Flatten PDF', mode: 'flattened', scale });
    if (!result || !ctx.isCurrent()) return;
    deliver(ctx, {
      bytes: result.result,
      mime: PDF_MIME,
      filename: `${safeName(result.file.name)}-flattened.pdf`,
      detail: 'Pages were rebuilt as images. Selectable text, annotations and form fields are not preserved.',
      stats: [`Source: ${result.total} page${result.total === 1 ? '' : 's'}`, `Processed: ${result.pages.length} page${result.pages.length === 1 ? '' : 's'}`, `Input: ${ctx.fmtBytes(result.file.size)}`, `Output: ${ctx.fmtBytes(result.result.byteLength)}`]
    });
  },

  'pdf-to-grayscale': async (ctx) => {
    const scale = numberValue(ctx, '#grayscale-quality', 1.5, { min: 1, max: 2.5, label: 'Render quality' });
    const result = await buildRasterPdf(ctx, { label: 'PDF to grayscale', mode: 'grayscale', scale });
    if (!result || !ctx.isCurrent()) return;
    deliver(ctx, {
      bytes: result.result,
      mime: PDF_MIME,
      filename: `${safeName(result.file.name)}-grayscale.pdf`,
      detail: 'Pages were rendered in greyscale and rebuilt as images. Selectable text is not preserved.',
      stats: [`Source: ${result.total} page${result.total === 1 ? '' : 's'}`, `Processed: ${result.pages.length} page${result.pages.length === 1 ? '' : 's'}`, `Input: ${ctx.fmtBytes(result.file.size)}`, `Output: ${ctx.fmtBytes(result.result.byteLength)}`]
    });
  },

  'pdf-metadata': async (ctx) => {
    const file = requirePdf(ctx, 'PDF metadata');
    ctx.setStatus(`Reading ${file.name}…`, 'info');
    const { doc } = await openPdf(file);
    if (!ctx.isCurrent()) return;
    const before = {
      title: doc.getTitle() || '',
      author: doc.getAuthor() || '',
      subject: doc.getSubject() || '',
      keywords: (doc.getKeywords() || []).join(', '),
      creator: doc.getCreator() || '',
      producer: doc.getProducer() || ''
    };
    const fields = {
      title: inputValue(ctx, '#meta-title', before.title),
      author: inputValue(ctx, '#meta-author', before.author),
      subject: inputValue(ctx, '#meta-subject', before.subject),
      keywords: inputValue(ctx, '#meta-keywords', before.keywords),
      creator: inputValue(ctx, '#meta-creator', before.creator),
      producer: inputValue(ctx, '#meta-producer', before.producer)
    };
    doc.setTitle(fields.title || '');
    doc.setAuthor(fields.author || '');
    doc.setSubject(fields.subject || '');
    doc.setKeywords(fields.keywords.split(',').map(part => part.trim()).filter(Boolean));
    doc.setCreator(fields.creator || '');
    doc.setProducer(fields.producer || '');
    doc.setModificationDate(new Date());
    const result = await savePdf(doc);
    if (!ctx.isCurrent()) return;
    deliver(ctx, {
      bytes: result,
      mime: PDF_MIME,
      filename: `${safeName(file.name)}-metadata.pdf`,
      detail: 'The document metadata was updated locally. Leave a field blank to clear it.',
      stats: [`Title: ${fields.title || '(cleared)'}`, `Author: ${fields.author || '(cleared)'}`, `Pages: ${doc.getPageCount()}`]
    });
  }
};
