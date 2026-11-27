/* Advanced PDF management tools for KriXo. Everything runs locally in the browser. */
import {
  assertExtension,
  assertInputSize,
  bytesOf,
  openPdf,
  savePdf,
  parsePageList,
  baseName,
  safeName,
  sanitizeHtml,
  extractPdfText,
  renderPdfPage,
  wrapText,
  standardFont,
  pdfTextColor,
  MAX_INPUT_BYTES
} from './pro-core.js';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import PDFKitDocument from 'pdfkit/js/pdfkit.standalone.js';
import blobStream from 'blob-stream';
import { createWorker } from 'tesseract.js';

/* ---------- small shared helpers ---------- */

function inputValue(ctx, selector, fallback = '') {
  const raw = ctx.$(selector)?.value;
  const text = raw == null ? '' : String(raw).trim();
  return text || fallback;
}

function isChecked(ctx, selector) {
  return Boolean(ctx.$(selector)?.checked);
}

function numberValue(ctx, selector, fallback, options = {}) {
  const { min = -Infinity, max = Infinity, integer = false, label = selector.replace('#', '') } = options;
  const raw = inputValue(ctx, selector, '');
  if (!raw) return fallback;
  const number = Number(raw);
  const inRange = number >= min && number <= max && (!integer || Number.isInteger(number));
  if (!Number.isFinite(number) || !inRange) {
    const bounds = min === -Infinity && max === Infinity ? '' : ` between ${min === -Infinity ? 'any number' : min} and ${max === Infinity ? 'any number' : max}`;
    throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'}${bounds}.`);
  }
  return number;
}

function pageLabel(value) {
  return value.slice(0, 30).join(', ') + (value.length > 30 ? '…' : '');
}

function pagesLabel(indices) {
  return pageLabel(indices.map(index => index + 1));
}

const isPdfFile = file => /\.pdf$/i.test(String(file?.name || ''));
const isImageFile = file => /\.(png|jpe?g)$/i.test(String(file?.name || ''));

async function loadSource(ctx, label) {
  const files = ctx.files?.length ? ctx.files : ctx.requireFiles?.();
  if (!files?.length) return null;
  // Mixed pickers let people choose the PDF and optional image in any order.
  const file = files.find(isPdfFile) || ctx.file || files[0];
  assertExtension(file, ['pdf'], label || 'This tool');
  ctx.setStatus(`Opening ${file.name}…`, 'info');
  const { bytes, doc } = await openPdf(file);
  if (!ctx.isCurrent()) return null;
  return { file, files, bytes, doc, count: doc.getPageCount() };
}

function optionalImage(ctx, label) {
  const files = ctx.files?.length ? ctx.files : ctx.requireFiles?.() || [];
  const pdfs = files.filter(isPdfFile);
  const images = files.filter(isImageFile);
  if (files.some(file => !isPdfFile(file) && !isImageFile(file))) {
    throw new Error('These tools accept only a PDF and an optional PNG/JPG image.');
  }
  if (pdfs.length > 1 || images.length > 1) {
    throw new Error('Choose one PDF and at most one PNG/JPG image.');
  }
  const file = images[0] || null;
  if (!file) return null;
  assertExtension(file, ['png', 'jpg', 'jpeg'], `${label} image`);
  assertInputSize(file);
  return file;
}

function isJpeg(file) {
  return /\.(jpe?g)$/i.test(file.name);
}

function tagPdf(doc, name, action) {
  try {
    doc.setTitle(`${safeName(name)} - ${action}`);
    doc.setAuthor('KriXo');
    doc.setCreator('KriXo');
    doc.setProducer('KriXo');
  } catch {
    /* Metadata is a nice-to-have; never block the output because of it. */
  }
}

function deliver(ctx, bytes, { filename, detail, stats = [], preview }) {
  const output = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  ctx.showResult({
    title: 'Your file is ready',
    detail,
    url: URL.createObjectURL(new Blob([output], { type: 'application/pdf' })),
    filename,
    stats,
    preview
  });
  ctx.setStatus('Done. Your file was processed on this device.', 'success');
}

/* Keeps duplicates and preserves the exact order the user typed. */
function parseOrderedPages(value, total) {
  const raw = String(value ?? '').trim();
  if (!raw) return Array.from({ length: total }, (_, index) => index);
  const result = [];
  for (const part of raw.split(/[\s,]+/).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`"${part}" is not a page number or range. Use values like 3,1,2-4.`);
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to > total || from > to) throw new Error(`Pages ${part} are outside this file (1-${total}).`);
    for (let number = from; number <= to; number++) result.push(number - 1);
  }
  if (!result.length) throw new Error('Choose at least one page.');
  return result;
}

function dataUrlToBytes(dataUrl) {
  const match = /^data:[^,]*;base64,(.*)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Could not read the rendered page image. Try a smaller PDF.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function looksLikeOcrDownloadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return /(language|traineddata|fetch|network|download|https?:\/\/|404|failed to load|unable to load|worker|onnx|timeout)/.test(message);
}

async function renderWithPdfJs(pdf, pageNumber, scale) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

/* ---------- handlers ---------- */

export const manageHandlers = {
  'organize-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'Organize PDF');
    if (!source) return;
    const { file, bytes, doc, count } = source;
    const order = parseOrderedPages(inputValue(ctx, '#page-order'), count);
    ctx.setStatus(`Arranging ${order.length} pages…`, 'info');

    const output = await PDFDocument.create();
    if (!ctx.isCurrent()) return;
    const copied = await output.copyPages(doc, order);
    if (!ctx.isCurrent()) return;
    copied.forEach(page => output.addPage(page));
    tagPdf(output, file.name, 'organized');
    const result = await savePdf(output);
    if (!ctx.isCurrent()) return;

    deliver(ctx, result, {
      filename: `${baseName(file.name)}-organized.pdf`,
      detail: 'Pages arranged in the order you specified.',
      stats: [`Source: ${count} page${count === 1 ? '' : 's'}`, `Output: ${order.length} page${order.length === 1 ? '' : 's'}`]
    });
  },

  'delete-pdf-pages': async (ctx) => {
    const source = await loadSource(ctx, 'Delete PDF pages');
    if (!source) return;
    const { file, doc, count } = source;
    const rawPages = inputValue(ctx, '#pages');
    const removed = rawPages.trim() ? parsePageList(rawPages, count) : [];
    if (!removed.length) throw new Error('Select at least one page to delete.');
    if (removed.length >= count) throw new Error('You cannot delete every page. Keep at least one page in the PDF.');
    const keep = Array.from({ length: count }, (_, index) => index).filter(index => !removed.includes(index));
    ctx.setStatus(`Removing ${removed.length} page${removed.length === 1 ? '' : 's'}…`, 'info');

    const output = await PDFDocument.create();
    if (!ctx.isCurrent()) return;
    const copied = await output.copyPages(doc, keep);
    if (!ctx.isCurrent()) return;
    copied.forEach(page => output.addPage(page));
    tagPdf(output, file.name, 'pages-removed');
    const result = await savePdf(output);
    if (!ctx.isCurrent()) return;

    deliver(ctx, result, {
      filename: `${baseName(file.name)}-pages-removed.pdf`,
      detail: `Removed ${removed.length} page${removed.length === 1 ? '' : 's'}: ${pagesLabel(removed)}.`,
      stats: [`Remaining: ${keep.length} page${keep.length === 1 ? '' : 's'}`]
    });
  },

  'extract-pdf-pages': async (ctx) => {
    const source = await loadSource(ctx, 'Extract PDF pages');
    if (!source) return;
    const { file, doc, count } = source;
    const selected = parsePageList(inputValue(ctx, '#pages'), count);
    ctx.setStatus(`Extracting ${selected.length} page${selected.length === 1 ? '' : 's'}…`, 'info');

    const output = await PDFDocument.create();
    if (!ctx.isCurrent()) return;
    const copied = await output.copyPages(doc, selected);
    if (!ctx.isCurrent()) return;
    copied.forEach(page => output.addPage(page));
    tagPdf(output, file.name, 'extracted');
    const result = await savePdf(output);
    if (!ctx.isCurrent()) return;

    deliver(ctx, result, {
      filename: `${baseName(file.name)}-extracted.pdf`,
      detail: `Extracted ${selected.length} page${selected.length === 1 ? '' : 's'}: ${pagesLabel(selected)}.`,
      stats: [`Source: ${count} page${count === 1 ? '' : 's'}`]
    });
  },

  'add-page-numbers': async (ctx) => {
    const source = await loadSource(ctx, 'Add page numbers');
    if (!source) return;
    const { file, doc, count } = source;
    const position = inputValue(ctx, '#number-position', 'bottom-center');
    if (!['bottom-center', 'bottom-right', 'top-center', 'top-right'].includes(position)) {
      throw new Error('Choose a valid number position (bottom or top, center or right).');
    }
    const start = numberValue(ctx, '#number-start', 1, { integer: true, label: 'Starting number' });
    const prefix = inputValue(ctx, '#number-prefix');
    const font = await standardFont(doc);
    if (!ctx.isCurrent()) return;
    const color = rgb(0.18, 0.2, 0.24);
    ctx.setStatus(`Numbering ${count} page${count === 1 ? '' : 's'}…`, 'info');

    for (let index = 0; index < count; index++) {
      const page = doc.getPage(index);
      const width = page.getWidth();
      const height = page.getHeight();
      const label = `${prefix}${start + index}`;
      const textWidth = font.widthOfTextAtSize(label, 11);
      let x = (width - textWidth) / 2;
      let y = 36;
      if (position.endsWith('-right')) x = width - 36 - textWidth;
      if (position.startsWith('top-')) y = height - 36 - 11;
      page.drawText(label, {
        x: Math.max(36, Math.min(width - 36 - textWidth, x)),
        y,
        size: 11,
        font,
        color,
        opacity: 0.92,
        maxWidth: width - 72
      });
    }
    if (!ctx.isCurrent()) return;

    tagPdf(doc, file.name, 'numbered');
    const result = await savePdf(doc);
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-numbered.pdf`,
      detail: `Page numbers added at the ${position.replace('-', ' ')}, starting at ${start}.`,
      stats: [`Numbered: ${count} page${count === 1 ? '' : 's'}`]
    });
  },

  'watermark-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'Watermark PDF');
    if (!source) return;
    const { file, doc, count } = source;
    const text = inputValue(ctx, '#watermark-text');
    const opacity = numberValue(ctx, '#watermark-opacity', 0.35, { min: 0.05, max: 1, label: 'Watermark opacity' });
    const angle = numberValue(ctx, '#watermark-angle', 45, { min: -180, max: 180, label: 'Watermark angle' });
    const position = inputValue(ctx, '#watermark-position', 'center');
    if (!['center', 'diagonal', 'top-right'].includes(position)) {
      throw new Error('Choose a valid watermark position (center, diagonal or top-right).');
    }

    let image = null;
    const imageFile = optionalImage(ctx, 'Watermark');
    if (imageFile) {
      const imageBytes = await bytesOf(imageFile);
      if (!ctx.isCurrent()) return;
      image = isJpeg(imageFile) ? await doc.embedJpg(imageBytes) : await doc.embedPng(imageBytes);
      if (!ctx.isCurrent()) return;
    }
    if (!text && !image) throw new Error('Enter watermark text or select a PNG/JPG image as the second file.');
    const font = text ? await standardFont(doc) : null;
    if (!ctx.isCurrent()) return;
    const color = rgb(0.26, 0.28, 0.33);
    ctx.setStatus(`Applying watermark to ${count} page${count === 1 ? '' : 's'}…`, 'info');

    for (let index = 0; index < count; index++) {
      const page = doc.getPage(index);
      const width = page.getWidth();
      const height = page.getHeight();
      if (image) {
        const scale = Math.min((width * 0.5) / image.width, (height * 0.5) / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const x = position === 'top-right' ? Math.max(12, width - 36 - drawWidth) : (width - drawWidth) / 2;
        const y = position === 'top-right' ? Math.max(12, height - 36 - drawHeight) : (height - drawHeight) / 2;
        page.drawImage(image, {
          x,
          y,
          width: drawWidth,
          height: drawHeight,
          opacity,
          rotate: position === 'diagonal' ? degrees(angle) : degrees(0)
        });
        continue;
      }

      const size = Math.max(16, Math.min(112, width * 0.09));
      const rotation = position === 'diagonal' ? degrees(angle) : degrees(0);
      if (position === 'top-right') {
        const lines = wrapText(text, 24).slice(0, 3);
        const topSize = Math.min(size, 28);
        lines.forEach((line, lineIndex) => {
          const lineWidth = font.widthOfTextAtSize(line, topSize);
          page.drawText(line, {
            x: Math.max(36, width - 36 - lineWidth),
            y: height - 36 - topSize * (lineIndex + 1),
            size: topSize,
            font,
            color,
            opacity,
            rotate: rotation,
            maxWidth: width - 72
          });
        });
      } else {
        const lines = wrapText(text, Math.max(10, Math.floor(width / (size * 0.55))));
        const lineHeight = size * 1.18;
        let y = height / 2 + (lines.length * lineHeight) / 2 - lineHeight;
        lines.forEach(line => {
          const lineWidth = font.widthOfTextAtSize(line, size);
          page.drawText(line, {
            x: Math.max(36, Math.min(width - 36 - lineWidth, (width - lineWidth) / 2)),
            y,
            size,
            font,
            color,
            opacity,
            rotate: rotation,
            maxWidth: width * 0.86
          });
          y -= lineHeight;
        });
      }
    }
    if (!ctx.isCurrent()) return;

    tagPdf(doc, file.name, 'watermarked');
    const result = await savePdf(doc);
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-watermarked.pdf`,
      detail: `Watermark applied to all ${count} page${count === 1 ? '' : 's'}.`,
      stats: [image ? 'Watermark: image' : `Watermark: "${text.slice(0, 40)}"`, `Opacity: ${Math.round(opacity * 100)}%`]
    });
  },

  'crop-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'Crop PDF');
    if (!source) return;
    const { file, doc, count } = source;
    const left = numberValue(ctx, '#crop-left', 0, { min: 0, label: 'Left crop' });
    const top = numberValue(ctx, '#crop-top', 0, { min: 0, label: 'Top crop' });
    const right = numberValue(ctx, '#crop-right', 0, { min: 0, label: 'Right crop' });
    const bottom = numberValue(ctx, '#crop-bottom', 0, { min: 0, label: 'Bottom crop' });
    if (!left && !top && !right && !bottom) throw new Error('Enter at least one crop amount in points.');
    ctx.setStatus(`Cropping ${count} page${count === 1 ? '' : 's'}…`, 'info');

    for (let index = 0; index < count; index++) {
      const page = doc.getPage(index);
      const width = page.getWidth();
      const height = page.getHeight();
      if (left + right >= width - 20) throw new Error(`Page ${index + 1} is too narrow for that crop. Leave at least 20pt of width.`);
      if (top + bottom >= height - 20) throw new Error(`Page ${index + 1} is too short for that crop. Leave at least 20pt of height.`);
      page.setCropBox(left, bottom, width - left - right, height - top - bottom);
    }
    if (!ctx.isCurrent()) return;

    tagPdf(doc, file.name, 'cropped');
    const result = await savePdf(doc);
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-cropped.pdf`,
      detail: `Cropped ${count} page${count === 1 ? '' : 's'} (left ${left}, top ${top}, right ${right}, bottom ${bottom} pt).`,
      stats: ['Measurements: points', `Pages: ${count}`]
    });
  },

  'protect-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'Protect PDF');
    if (!source) return;
    const { file, bytes, doc, count } = source;
    const password = inputValue(ctx, '#password');
    if (!password) throw new Error('Enter a password before protecting the PDF.');
    if (password.length < 6) throw new Error('Use a password of at least 6 characters.');
    const confirm = String(ctx.$('#password-confirm')?.value ?? '').trim();
    if (confirm !== password) {
      throw new Error('The two passwords do not match. Re-enter and try again.');
    }
    const sizes = doc.getPageIndices().map(index => {
      const page = doc.getPage(index);
      return [page.getWidth(), page.getHeight()];
    });

    const protectedDoc = new PDFKitDocument({
      userPassword: password,
      ownerPassword: `${password}-krixo-owner`,
      permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false },
      pdfVersion: '1.7',
      autoFirstPage: false,
      compress: true
    });
    const stream = protectedDoc.pipe(blobStream());
    let stale = false;

    for (let index = 0; index < count; index++) {
      ctx.setStatus(`Protecting page ${index + 1} of ${count}…`, 'info');
      const canvas = await renderPdfPage(bytes, index + 1, 2);
      if (!ctx.isCurrent()) { stale = true; break; }
      const imageBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
      const [width, height] = sizes[index];
      protectedDoc.addPage({ size: [width, height], margin: 0 });
      protectedDoc.image(imageBytes.buffer, 0, 0, { width, height });
    }
    const finished = new Promise((resolve, reject) => {
      stream.on('finish', () => {
        try { resolve(stream.toBlob('application/pdf')); }
        catch (error) { reject(error); }
      });
      stream.on('error', reject);
      protectedDoc.on('error', reject);
    });
    protectedDoc.end();
    const blob = await finished;
    if (stale || !ctx.isCurrent()) return;
    const result = new Uint8Array(await blob.arrayBuffer());
    if (!ctx.isCurrent()) return;

    deliver(ctx, result, {
      filename: `${baseName(file.name)}-protected.pdf`,
      detail: 'Password protection applied. Pages were rebuilt as high-quality images; selectable text and bookmarks are not retained.',
      stats: [`Password: ${password.length} characters`, `Pages: ${count}`]
    });
  },

  'sign-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'Sign PDF');
    if (!source) return;
    const { file, doc, count } = source;
    const imageFile = optionalImage(ctx, 'Signature');
    const text = inputValue(ctx, '#signature-text');
    if (!imageFile && !text) throw new Error('Enter your signature text or select a PNG/JPG signature image as the second file.');
    const allPages = isChecked(ctx, '#sign-all');
    const position = inputValue(ctx, '#sign-position', 'bottom-right');
    if (!['bottom-right', 'bottom-left', 'top-right'].includes(position)) {
      throw new Error('Choose a valid signature position (bottom-right, bottom-left or top-right).');
    }
    const width = numberValue(ctx, '#sign-size', 90, { min: 20, max: 500, label: 'Signature width' });

    let image = null;
    let font = null;
    if (imageFile) {
      const imageBytes = await bytesOf(imageFile);
      if (!ctx.isCurrent()) return;
      image = isJpeg(imageFile) ? await doc.embedJpg(imageBytes) : await doc.embedPng(imageBytes);
      if (!ctx.isCurrent()) return;
    } else {
      font = await doc.embedFont(StandardFonts.HelveticaOblique);
      if (!ctx.isCurrent()) return;
    }
    const indices = allPages ? doc.getPageIndices() : [count - 1];
    ctx.setStatus(`Adding signature to ${indices.length} page${indices.length === 1 ? '' : 's'}…`, 'info');

    for (const index of indices) {
      const page = doc.getPage(index);
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      let drawWidth = Math.min(width, pageWidth - 72);
      let drawHeight = 30;
      if (image) {
        const scale = Math.min(width / image.width, (pageWidth - 72) / image.width, (pageHeight - 72) / image.height);
        drawWidth = image.width * scale;
        drawHeight = image.height * scale;
      }
      drawHeight = Math.max(1, Math.min(drawHeight, pageHeight - 72));
      const x = position === 'bottom-left' ? 36 : pageWidth - 36 - drawWidth;
      const y = position === 'top-right' ? pageHeight - 36 - drawHeight : 36;

      if (image) {
        page.drawImage(image, { x, y, width: drawWidth, height: drawHeight, opacity: 0.95 });
      } else {
        let size = 24;
        while (size > 6 && font.widthOfTextAtSize(text, size) > drawWidth) size -= 1;
        const lineY = y + size + 8;
        page.drawLine({
          start: { x, y: lineY },
          end: { x: x + drawWidth, y: lineY },
          thickness: 0.8,
          color: rgb(0.35, 0.39, 0.46)
        });
        page.drawText(text, {
          x: Math.max(36, Math.min(pageWidth - 36 - font.widthOfTextAtSize(text, size), x)),
          y,
          size,
          font,
          color: rgb(0.12, 0.2, 0.42),
          opacity: 0.95,
          maxWidth: drawWidth
        });
      }
    }
    if (!ctx.isCurrent()) return;

    tagPdf(doc, file.name, 'signed');
    const result = await savePdf(doc);
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-signed.pdf`,
      detail: 'Visible signature added. This is a visual signature, not a cryptographic digital signature.',
      stats: [`Signed: ${indices.length} page${indices.length === 1 ? '' : 's'}`, image ? 'Signature: image' : 'Signature: text']
    });
  },

  'edit-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'Edit PDF');
    if (!source) return;
    const { file, doc, count } = source;
    const text = inputValue(ctx, '#edit-text');
    const imageFile = optionalImage(ctx, 'Stamp');
    if (!text && !imageFile) throw new Error('Enter text to add, or select a PNG/JPG image as the second file to stamp.');
    const x = numberValue(ctx, '#edit-x', 72, { min: 0, label: 'X position' });
    const y = numberValue(ctx, '#edit-y', 72, { min: 0, label: 'Y position' });
    const size = numberValue(ctx, '#edit-size', 14, { min: 4, max: 200, label: 'Text size' });
    const color = pdfTextColor(inputValue(ctx, '#edit-color', '#111827'));
    const pageNumber = numberValue(ctx, '#edit-page', 1, { integer: true, min: 1, label: 'Page number' });
    if (pageNumber > count) throw new Error(`This PDF has ${count} page${count === 1 ? '' : 's'}. Choose a page from 1 to ${count}.`);
    const page = doc.getPage(pageNumber - 1);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    if (x > pageWidth || y > pageHeight) {
      throw new Error(`Those coordinates are outside page ${pageNumber} (${Math.round(pageWidth)} × ${Math.round(pageHeight)} pt).`);
    }

    const font = text ? await standardFont(doc) : null;
    if (!ctx.isCurrent()) return;
    let image = null;
    if (imageFile) {
      const imageBytes = await bytesOf(imageFile);
      if (!ctx.isCurrent()) return;
      image = isJpeg(imageFile) ? await doc.embedJpg(imageBytes) : await doc.embedPng(imageBytes);
      if (!ctx.isCurrent()) return;
    }

    ctx.setStatus(`Editing page ${pageNumber}…`, 'info');
    if (text) {
      const textWidth = font.widthOfTextAtSize(text, size);
      if (x + textWidth > pageWidth || y + size > pageHeight) {
        throw new Error('The text does not fit at those coordinates. Move it closer to the top-left or reduce the size.');
      }
      page.drawText(text, { x, y: pageHeight - y - size, size, font, color, maxWidth: pageWidth - x - 36 });
    }
    if (image) {
      const stampWidth = size * 3;
      const stampHeight = stampWidth * (image.height / image.width);
      if (x + stampWidth > pageWidth || y + stampHeight > pageHeight) {
        throw new Error('The image stamp does not fit at those coordinates. Move it closer to the top-left or reduce the size.');
      }
      page.drawImage(image, { x, y: pageHeight - y - stampHeight, width: stampWidth, height: stampHeight, opacity: 0.95 });
    }
    if (!ctx.isCurrent()) return;

    tagPdf(doc, file.name, 'edited');
    const result = await savePdf(doc);
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-edited.pdf`,
      detail: `${text ? 'Text' : 'Image'} added to page ${pageNumber}${text && image ? ' with an image stamp' : ''}.`,
      stats: [`Position: ${Math.round(x)}, ${Math.round(y)} pt from top-left`, `Page: ${pageNumber} of ${count}`]
    });
  },

  'repair-pdf': async (ctx) => {
    /* Repair must not preflight with openPdf(): a damaged PDF is exactly the case
       that needs the render-rebuild fallback below. */
    const files = ctx.files?.length ? ctx.files : ctx.requireFiles?.();
    const file = ctx.file || files?.[0];
    if (!file) throw new Error('Choose a PDF file first.');
    assertExtension(file, ['pdf'], 'Repair PDF');
    ctx.setStatus(`Opening ${file.name}…`, 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    let method = '';
    let result = null;

    ctx.setStatus('Trying to rebuild the PDF structure…', 'info');
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
      if (!ctx.isCurrent()) return;
      result = new Uint8Array(await doc.save({ useObjectStreams: true }));
      if (!ctx.isCurrent()) return;
      method = 'Repaired by re-saving the PDF structure.';
    } catch (firstError) {
      if (!ctx.isCurrent()) return;
      ctx.setStatus('Structure repair failed. Rebuilding pages from rendered images…', 'info');
      let pdf = null;
      try {
        pdf = await pdfjsLib.getDocument({ data: bytes.slice(0), stopAtErrors: false, disableWorker: true }).promise;
        if (!ctx.isCurrent()) return;
        if (pdf.numPages > 60) throw new Error('This damaged PDF has more than 60 pages. Split it and try again.');
        const firstViewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
        const rebuilt = new jsPDF({ unit: 'pt', format: [firstViewport.width, firstViewport.height], compress: true });
        for (let number = 1; number <= pdf.numPages; number++) {
          ctx.setStatus(`Rebuilding page ${number} of ${pdf.numPages}…`, 'info');
          const info = await pdf.getPage(number);
          if (!ctx.isCurrent()) return;
          const viewport = info.getViewport({ scale: 1 });
          const width = viewport.width;
          const height = viewport.height;
          let canvas;
          try {
            canvas = await renderPdfPage(bytes, number, 2);
          } catch {
            canvas = await renderWithPdfJs(pdf, number, 2);
          }
          if (!ctx.isCurrent()) return;
          if (number > 1) rebuilt.addPage([width, height], width > height ? 'landscape' : 'portrait');
          rebuilt.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, width, height, undefined, 'FAST');
        }
        if (!ctx.isCurrent()) return;
        result = new Uint8Array(rebuilt.output('arraybuffer'));
        if (!ctx.isCurrent()) return;
        method = 'Repaired by rebuilding pages from rendered images.';
      } catch (secondError) {
        if (!ctx.isCurrent()) return;
        throw new Error('This file could not be repaired by the browser. Try a desktop PDF repair tool.');
      } finally {
        try { await pdf?.destroy(); } catch { /* ignore cleanup failures */ }
      }
    }
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-repaired.pdf`,
      detail: method,
      stats: [`Original: ${file.name.slice(0, 40)}`, 'Processed locally']
    });
  },

  'ocr-pdf': async (ctx) => {
    const source = await loadSource(ctx, 'OCR PDF');
    if (!source) return;
    const { file, bytes, doc, count } = source;
    if (count > 20) throw new Error('OCR supports up to 20 pages at a time. Split the PDF and try again.');
    const force = isChecked(ctx, '#ocr-force');
    ctx.setStatus('Checking pages for existing text…', 'info');
    const existing = await extractPdfText(bytes);
    if (!ctx.isCurrent()) return;

    const targets = [];
    for (let index = 0; index < count; index++) {
      if (force || !(existing[index]?.lines?.length)) targets.push(index);
    }
    if (!targets.length) {
      throw new Error('Every page already has selectable text. Select Force OCR if you still want to rebuild the text layer.');
    }

    const recognized = new Map();
    let worker = null;
    let timeoutId = null;
    try {
      ctx.setStatus('Loading OCR language data…', 'info');
      const workerPromise = createWorker('eng', 1, {
        workerPath: '/assets/tesseract/worker.min.js',
        corePath: '/assets/tesseract',
        langPath: '/assets/tesseract/lang',
        workerBlobURL: false,
        gzip: true,
        cacheMethod: 'write',
        logger: message => {
          if (ctx.isCurrent() && message.status === 'recognizing text') {
            ctx.setStatus(`Recognizing text: ${Math.round((message.progress || 0) * 100)}%`, 'info');
          }
        }
      });
      // If loading times out, terminate a late worker. On the normal path leave it alive.
      let timedOut = false;
      workerPromise.then(lateWorker => {
        if (timedOut) lateWorker?.terminate?.().catch(() => {});
      }).catch(() => {});
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error('OCR language data took too long to load from this site. Reload and try again.'));
        }, 60000);
      });
      worker = await Promise.race([workerPromise, timeoutPromise]);
      if (!ctx.isCurrent()) return;
      for (const index of targets) {
        ctx.setStatus(`Reading page ${index + 1} of ${count}…`, 'info');
        const canvas = await renderPdfPage(bytes, index + 1, 2);
        if (!ctx.isCurrent()) return;
        const { data } = await worker.recognize(canvas);
        if (!ctx.isCurrent()) return;
        recognized.set(index, String(data?.text || '').trim());
      }
    } catch (error) {
      if (!ctx.isCurrent()) return;
      if (looksLikeOcrDownloadError(error)) {
        throw new Error('OCR language data could not be loaded from this site. Reload the page and try again.');
      }
      throw new Error(`OCR failed: ${String(error?.message || error || 'unknown error')}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (worker) {
        try { await worker.terminate(); } catch { /* ignore cleanup failures */ }
      }
    }
    if (!ctx.isCurrent()) return;

    ctx.setStatus('Adding a searchable text layer…', 'info');
    const output = await PDFDocument.create();
    if (!ctx.isCurrent()) return;
    const copied = await output.copyPages(doc, doc.getPageIndices());
    if (!ctx.isCurrent()) return;
    copied.forEach(page => output.addPage(page));
    const font = await standardFont(output);
    if (!ctx.isCurrent()) return;

    for (const [index, text] of recognized) {
      if (!text) continue;
      const page = output.getPage(index);
      const width = page.getWidth();
      const height = page.getHeight();
      const columns = 2;
      const columnWidth = width / columns;
      const lineHeight = 10;
      const rowsPerColumn = Math.max(1, Math.floor((height - 36) / lineHeight));
      const lines = wrapText(text.replace(/\s+/g, ' '), Math.max(20, Math.floor(columnWidth / 3))).slice(0, rowsPerColumn * columns);
      lines.forEach((line, lineIndex) => {
        const column = Math.floor(lineIndex / rowsPerColumn);
        const row = lineIndex % rowsPerColumn;
        page.drawText(line.slice(0, 160), {
          x: 18 + column * columnWidth,
          y: height - 24 - row * lineHeight,
          size: 6,
          font,
          color: rgb(1, 1, 1),
          opacity: 0,
          maxWidth: columnWidth - 36
        });
      });
    }
    if (!ctx.isCurrent()) return;

    tagPdf(output, file.name, 'ocr');
    const result = await savePdf(output);
    if (!ctx.isCurrent()) return;
    deliver(ctx, result, {
      filename: `${baseName(file.name)}-ocr.pdf`,
      detail: 'Searchable text layer added to scanned pages.',
      stats: [`OCR pages: ${targets.length} of ${count}`, 'Language: English']
    });
  }
};
