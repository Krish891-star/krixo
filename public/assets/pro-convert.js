import mammoth from 'mammoth/mammoth.browser.js';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { Document, Paragraph, TextRun, HeadingLevel, PageBreak, Packer } from 'docx';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  assertExtension,
  assertInputSize,
  bytesOf,
  openPdf,
  savePdf,
  htmlToPdfBytes,
  extractPdfText,
  renderPdfPage,
  renderPdfPages,
  wrapText,
  baseName,
  safeName,
  escapeHtmlText
} from './pro-core.js';

const PDF_MIME = 'application/pdf';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAX_SHEET_ROWS = 1000;
const MAX_SHEET_COLS = 40;
const MAX_PPTX_PAGES = 60;

function requireInput(file, extensions, label) {
  if (!file) throw new Error('Choose a file first.');
  assertExtension(file, extensions, label);
  assertInputSize(file);
  return file;
}

function deliver(ctx, { bytes, mime, filename, detail, stats = [] }) {
  if (!ctx.isCurrent()) return;
  ctx.showResult({
    title: 'Your file is ready',
    detail,
    url: URL.createObjectURL(new Blob([bytes], { type: mime })),
    filename,
    stats
  });
}

function asText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function looksLikeHeader(row) {
  if (!Array.isArray(row) || !row.length) return false;
  const filled = row.filter(value => value !== '' && value != null);
  if (!filled.length) return false;
  const textish = filled.filter(value => typeof value === 'string' && value.trim() && Number.isNaN(Number(value)));
  return textish.length / filled.length >= 0.5;
}

function resolveZipPath(baseDir, target) {
  const absolute = /^\//.test(String(target));
  const parts = absolute ? [] : String(baseDir).split('/').filter(Boolean);
  for (const part of String(target).replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function parseXml(text) {
  return new DOMParser().parseFromString(String(text || ''), 'application/xml');
}

async function orderedSlideFiles(zip) {
  const ordered = [];
  const presentation = zip.file('ppt/presentation.xml');
  const rels = zip.file('ppt/_rels/presentation.xml.rels');
  if (presentation && rels) {
    try {
      const relMap = new Map();
      const relXml = parseXml(await rels.async('string'));
      for (const rel of Array.from(relXml.getElementsByTagName('Relationship'))) {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        const type = rel.getAttribute('Type') || '';
        if (id && target && /\/slide$/.test(type)) relMap.set(id, resolveZipPath('ppt', target));
      }
      const presXml = parseXml(await presentation.async('string'));
      for (const slideRef of Array.from(presXml.getElementsByTagName('p:sldId'))) {
        const rid = slideRef.getAttribute('r:id') || slideRef.getAttributeNS(R_NS, 'id');
        if (relMap.has(rid)) ordered.push(relMap.get(rid));
      }
    } catch {
      ordered.length = 0;
    }
  }
  if (ordered.length) return ordered;
  return Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)[1]) - Number(b.match(/slide(\d+)\.xml$/)[1]));
}

const IMAGE_FORMATS = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
};

function jsPdfImageFormat(dataUrl) {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/gif')) return 'GIF';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  if (dataUrl.startsWith('data:image/bmp')) return 'BMP';
  return 'JPEG';
}

function fitImage(dataUrl, pdf, maxW, maxH) {
  let ratio = 1.5;
  try {
    const props = pdf.getImageProperties(dataUrl);
    if (props.width && props.height) ratio = props.width / props.height;
  } catch {
    ratio = 1.5;
  }
  let w = Math.min(maxW, maxH * ratio);
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { w, h };
}

export const convertHandlers = {
  'word-to-pdf': async (ctx) => {
    const file = requireInput(ctx.file, ['docx'], 'Word to PDF');
    ctx.setStatus('Reading Word document…', 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const result = await mammoth.convertToHtml({ arrayBuffer });
    if (!ctx.isCurrent()) return;

    const title = ctx.$('#doc-title')?.value?.trim() || 'Converted document';
    ctx.setStatus('Rendering document as PDF pages…', 'info');
    const html = String(result?.value || '');
    if (!html.trim()) throw new Error('No readable content was found in this Word document.');
    const pdfBytes = await htmlToPdfBytes(html, { title });
    if (!ctx.isCurrent()) return;

    const pdf = await PDFDocument.load(pdfBytes);
    if (!ctx.isCurrent()) return;
    const pages = pdf.getPageCount();
    deliver(ctx, {
      bytes: pdfBytes,
      mime: PDF_MIME,
      filename: `${safeName(file.name)}-converted.pdf`,
      detail: 'Word content was rendered into real PDF pages in your browser. Pages are image-based, so text is not selectable or searchable in the PDF.',
      stats: [`Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(pdfBytes.byteLength)}`, `Pages: ${pages}`]
    });
  },

  'pdf-to-word': async (ctx) => {
    const file = requireInput(ctx.file, ['pdf'], 'PDF to Word');
    ctx.setStatus('Extracting text from PDF…', 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    const pages = await extractPdfText(bytes);
    if (!ctx.isCurrent()) return;

    const lines = pages.flatMap(page => page.lines.filter(line => line.text));
    if (!lines.length) throw new Error('No selectable text was found in this PDF. Scanned PDFs need OCR first.');

    const children = [];
    let firstLine = true;
    for (const [pageIndex, page] of pages.entries()) {
      if (pageIndex) children.push(new Paragraph({ children: [new PageBreak()] }));
      let previousY = null;
      for (const line of page.lines) {
        if (!line.text) continue;
        if (previousY !== null && previousY - line.y > 14) {
          children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
        }
        const wordText = line.text.replace(/\t/g, '  ');
        children.push(firstLine
          ? new Paragraph({ text: wordText, heading: HeadingLevel.HEADING_1 })
          : new Paragraph({ children: [new TextRun({ text: wordText })] }));
        firstLine = false;
        previousY = line.y;
      }
    }

    ctx.setStatus('Building editable Word document…', 'info');
    const doc = new Document({ sections: [{ children }] });
    const docxBytes = await Packer.toArrayBuffer(doc);
    if (!ctx.isCurrent()) return;

    deliver(ctx, {
      bytes: docxBytes,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: `${safeName(file.name)}-converted.docx`,
      detail: 'PDF layout was converted to editable text in Word; it is not an exact visual clone of the original pages.',
      stats: [`Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(docxBytes.byteLength)}`, `Lines: ${lines.length}`, `Pages: ${pages.length}`]
    });
  },

  'excel-to-pdf': async (ctx) => {
    const file = requireInput(ctx.file, ['xlsx', 'xls', 'csv'], 'Excel to PDF');
    ctx.setStatus('Reading workbook…', 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    const workbook = XLSX.read(bytes, { type: 'array' });
    if (!ctx.isCurrent()) return;
    const names = workbook.SheetNames || [];
    if (!names.length) throw new Error('This workbook has no worksheets to convert.');

    let pdf;
    let totalRows = 0;
    for (const [index, name] of names.entries()) {
      ctx.setStatus(`Preparing sheet ${index + 1} of ${names.length}: ${name}`, 'info');
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false })
        .filter(row => Array.isArray(row));
      const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
      if (rows.length > MAX_SHEET_ROWS) {
        throw new Error(`Sheet "${name}" has ${rows.length.toLocaleString()} rows. Excel to PDF supports up to ${MAX_SHEET_ROWS.toLocaleString()} rows per sheet — split it into smaller sheets and try again.`);
      }
      if (columnCount > MAX_SHEET_COLS) {
        throw new Error(`Sheet "${name}" has ${columnCount} columns. Excel to PDF supports up to ${MAX_SHEET_COLS} columns per sheet — remove extra columns and try again.`);
      }
      if (!ctx.isCurrent()) return;
      if (!rows.length || !columnCount) {
        if (!pdf) pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
        else pdf.addPage('a4', 'portrait');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        pdf.text(`Sheet "${String(name).slice(0, 70)}" has no data.`, 40, 60);
        continue;
      }

      const visibleRows = rows.slice(0, MAX_SHEET_ROWS);
      const headerRow = visibleRows[0];
      const hasHeader = looksLikeHeader(headerRow);
      const body = (hasHeader ? visibleRows.slice(1) : visibleRows)
        .map(row => Array.from({ length: columnCount }, (_, col) => asText(row[col])));
      const head = hasHeader
        ? Array.from({ length: columnCount }, (_, col) => asText(headerRow[col]) || `Column ${col + 1}`)
        : Array.from({ length: columnCount }, (_, col) => `Column ${col + 1}`);
      totalRows += visibleRows.length;

      const landscape = columnCount > 8;
      const orientation = landscape ? 'landscape' : 'portrait';
      if (!pdf) pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });
      else pdf.addPage('a4', orientation);

      const pageWidth = pdf.internal.pageSize.getWidth();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text(String(name).slice(0, 80), 40, 42);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`${visibleRows.length} row${visibleRows.length === 1 ? '' : 's'} · ${columnCount} column${columnCount === 1 ? '' : 's'}`, pageWidth - 40, 42, { align: 'right' });
      pdf.setFontSize(10);

      autoTable(pdf, {
        head: [head],
        body,
        startY: 54,
        styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
        margin: { left: 40, right: 40 }
      });
    }
    if (!ctx.isCurrent()) return;

    const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
    deliver(ctx, {
      bytes: pdfBytes,
      mime: PDF_MIME,
      filename: `${safeName(file.name)}-converted.pdf`,
      detail: 'Worksheets were written as selectable table pages. Long sheets may span several PDF pages; blank cells are omitted and only the first 1,000 rows and 40 columns are included.',
      stats: [`Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(pdfBytes.byteLength)}`, `Sheets: ${names.length}`, `Rows: ${totalRows}`, `PDF pages: ${pdf.getNumberOfPages()}`]
    });
  },

  'pdf-to-excel': async (ctx) => {
    const file = requireInput(ctx.file, ['pdf'], 'PDF to Excel');
    ctx.setStatus('Extracting text from PDF…', 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    const pages = await extractPdfText(bytes);
    if (!ctx.isCurrent()) return;
    if (!pages.some(page => page.lines.some(line => line.text))) {
      throw new Error('No selectable text was found in this PDF. Scanned PDFs need OCR first.');
    }

    const workbook = XLSX.utils.book_new();
    let rowsWritten = 0;
    let sheetsWritten = 0;
    ctx.setStatus('Building workbook from PDF text…', 'info');
    for (const page of pages) {
      if (!ctx.isCurrent()) return;
      const rows = [];
      for (const line of page.lines) {
        if (!line.text) continue;
        const cells = line.text.trim().split(/\t/).map(cell => cell.trim()).filter(Boolean);
        rows.push([`Page ${page.number}`, ...(cells.length > 1 ? cells : [line.text.trim()])]);
      }
      rowsWritten += rows.length;
      const sheet = XLSX.utils.aoa_to_sheet(rows.length ? rows : [[`Page ${page.number}`, 'No selectable text']]);
      const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
      const widths = Array.from({ length: Math.max(2, maxColumns) }, (_, col) => ({
        wch: rows.reduce((max, row) => Math.min(60, Math.max(max, asText(row[col] || '').length + 2)), 10)
      }));
      sheet['!cols'] = widths;
      XLSX.utils.book_append_sheet(workbook, sheet, `Page ${page.number}`.slice(0, 31));
      sheetsWritten++;
    }

    const xlsxBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    if (!ctx.isCurrent()) return;

    deliver(ctx, {
      bytes: xlsxBytes,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${safeName(file.name)}-converted.xlsx`,
      detail: 'Table detection is text-based: cells are split where the PDF shows wide gaps or tabs. Check the sheets after download.',
      stats: [`Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(xlsxBytes.byteLength)}`, `Sheets: ${sheetsWritten}`, `Rows: ${rowsWritten}`]
    });
  },

  'pptx-to-pdf': async (ctx) => {
    const file = requireInput(ctx.file, ['pptx'], 'PowerPoint to PDF');
    ctx.setStatus('Opening PowerPoint file…', 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    let zip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      throw new Error('This PowerPoint file could not be opened. It may be damaged or not a real .pptx file.');
    }
    if (!ctx.isCurrent()) return;

    const presentation = await zip.file('ppt/presentation.xml')?.async('string') || '';
    if (!ctx.isCurrent()) return;
    const sizeTag = presentation.match(/<p:sldSz\b[^>]*>/)?.[0] || '';
    const emuWidth = Number(sizeTag.match(/\bcx="(\d+)"/)?.[1]) || 9144000;
    const emuHeight = Number(sizeTag.match(/\bcy="(\d+)"/)?.[1]) || 5143500;
    let pageW = emuWidth / 12700;
    let pageH = emuHeight / 12700;
    if (!Number.isFinite(pageW) || !Number.isFinite(pageH) || pageW <= 0 || pageH <= 0) {
      pageW = 720;
      pageH = 405;
    }
    const fit = Math.min(1, 720 / pageW, 540 / pageH);
    pageW *= fit;
    pageH *= fit;

    const slideFiles = await orderedSlideFiles(zip);
    if (!ctx.isCurrent()) return;
    if (!slideFiles.length) throw new Error('No slides were found in this PowerPoint file.');
    ctx.setStatus(`Found ${slideFiles.length} slide${slideFiles.length === 1 ? '' : 's'}. Rendering…`, 'info');

    let pdf;
    let imagesUsed = 0;
    let textBoxes = 0;
    for (const [index, slideName] of slideFiles.entries()) {
      if (!ctx.isCurrent()) return;
      ctx.setStatus(`Rendering slide ${index + 1} of ${slideFiles.length}…`, 'info');
      const entry = zip.file(slideName);
      if (!entry) continue;
      const slideXml = parseXml(await entry.async('string'));
      if (!ctx.isCurrent()) return;

      const paragraphs = Array.from(slideXml.getElementsByTagName('a:p'))
        .map(paragraph => Array.from(paragraph.getElementsByTagName('a:t'))
          .map(run => run.textContent || '').join('').trim())
        .filter(Boolean);

      const images = [];
      const relName = `ppt/slides/_rels/${slideName.split('/').pop()}.rels`;
      const relEntry = zip.file(relName);
      if (relEntry) {
        const relXml = parseXml(await relEntry.async('string'));
        if (!ctx.isCurrent()) return;
        const relMap = new Map();
        for (const rel of Array.from(relXml.getElementsByTagName('Relationship'))) {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (id && target) relMap.set(id, resolveZipPath('ppt/slides', target));
        }
        for (const blip of Array.from(slideXml.getElementsByTagName('a:blip'))) {
          const rid = blip.getAttribute('r:embed') || blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:link') || blip.getAttributeNS(R_NS, 'link');
          const path = relMap.get(rid);
          if (!path) continue;
          const media = zip.file(path);
          const mime = IMAGE_FORMATS[path.split('.').pop().toLowerCase()];
          if (!media || !mime) continue;
          try {
            const base64 = await media.async('base64');
            if (!ctx.isCurrent()) return;
            images.push(`data:${mime};base64,${base64}`);
          } catch {
            // A broken or encrypted image must not stop the rest of the slide.
          }
        }
      }

      const orientation = pageW >= pageH ? 'landscape' : 'portrait';
      if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [pageW, pageH], orientation, compress: true });
      else pdf.addPage([pageW, pageH], orientation);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, pageH, 'F');

      if (images.length === 1) {
        try {
          const { w, h } = fitImage(images[0], pdf, pageW, pageH);
          pdf.addImage(images[0], jsPdfImageFormat(images[0]), (pageW - w) / 2, (pageH - h) / 2, w, h, undefined, 'FAST');
          imagesUsed++;
        } catch {
          // Unsupported encodings are skipped; text is still reconstructed.
        }
      } else if (images.length > 1) {
        const cellW = pageW * 0.28;
        const cellH = pageH * 0.28;
        const rowsPerPage = Math.max(1, Math.floor((pageH - 20) / (cellH + 8)));
        for (const [imageIndex, dataUrl] of images.entries()) {
          const pageRow = imageIndex % rowsPerPage;
          if (imageIndex && pageRow === 0) {
            pdf.addPage([pageW, pageH], orientation);
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, pageW, pageH, 'F');
          }
          const { w, h } = fitImage(dataUrl, pdf, cellW, cellH);
          const x = pageW - w - 10 - (imageIndex % 2) * (cellW + 8);
          const y = 10 + pageRow * (cellH + 8);
          try {
            pdf.addImage(dataUrl, jsPdfImageFormat(dataUrl), x, y, w, h, undefined, 'FAST');
            imagesUsed++;
          } catch {
            // Ignore images jsPDF cannot decode.
          }
        }
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(14);
      pdf.setTextColor(17, 24, 39);
      const maxChars = Math.max(18, Math.floor((pageW * (images.length > 1 ? 0.6 : 0.92)) / 7));
      let y = 28;
      for (const paragraph of paragraphs) {
        for (const line of wrapText(paragraph, maxChars)) {
          if (y > pageH - 18) break;
          pdf.text(line, 18, y);
          y += 18;
          textBoxes++;
        }
      }
    }
    if (!pdf) throw new Error('No readable slides were found in this PowerPoint file.');
    if (!ctx.isCurrent()) return;

    const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
    deliver(ctx, {
      bytes: pdfBytes,
      mime: PDF_MIME,
      filename: `${safeName(file.name)}-converted.pdf`,
      detail: 'Slide text and embedded images were reconstructed into PDF pages in a simplified layout. Positions, themes, masters, charts, animations, transitions and speaker notes are not reproduced.',
      stats: [`Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(pdfBytes.byteLength)}`, `Slides: ${slideFiles.length}`, `Images placed: ${imagesUsed}`, `Text lines: ${textBoxes}`]
    });
  },

  'pdf-to-pptx': async (ctx) => {
    const file = requireInput(ctx.file, ['pdf'], 'PDF to PowerPoint');
    ctx.setStatus('Extracting text from PDF…', 'info');
    const bytes = await bytesOf(file);
    if (!ctx.isCurrent()) return;
    const pages = await extractPdfText(bytes);
    if (!ctx.isCurrent()) return;
    if (pages.length > MAX_PPTX_PAGES) {
      throw new Error(`This PDF has ${pages.length} pages. PDF to PowerPoint supports up to ${MAX_PPTX_PAGES} pages — split it first.`);
    }
    if (!pages.length) throw new Error('This PDF has no pages that could be converted.');

    const first = pages[0];
    const validSize = Number.isFinite(first.width) && Number.isFinite(first.height) && first.width > 0 && first.height > 0;
    const ratio = validSize ? first.width / first.height : 16 / 9;
    let slideW = 13.333;
    let slideH = 7.5;
    if (ratio > slideW / slideH) slideH = slideW / ratio;
    else slideW = slideH * ratio;

    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'KRIXO_PDF', width: slideW, height: slideH });
    pptx.layout = 'KRIXO_PDF';

    let scannedPages = 0;
    let textBoxes = 0;
    const scannedNumbers = pages.filter(page => !page.lines.some(line => line.text)).map(page => page.number);
    const scannedCanvases = scannedNumbers.length ? await renderPdfPages(bytes, scannedNumbers, 1.5) : new Map();
    if (!ctx.isCurrent()) return;
    for (const page of pages) {
      if (!ctx.isCurrent()) return;
      ctx.setStatus(`Building slide ${page.number} of ${pages.length}…`, 'info');
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      const scaleX = slideW / page.width;
      const scaleY = slideH / page.height;
      const lines = page.lines.filter(line => line.text);

      if (!lines.length) {
        const canvas = scannedCanvases.get(page.number);
        if (canvas) {
          slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.9), x: 0, y: 0, w: slideW, h: slideH });
          scannedPages++;
        }
        continue;
      }

      for (const line of lines) {
        for (const item of line.items) {
          if (!item.text || !item.text.trim()) continue;
          const x = Math.max(0, Math.min(slideW - 0.1, item.x * scaleX));
          const topPt = page.height - line.y - (item.height || 10);
          const y = Math.max(0, Math.min(slideH - 0.2, topPt * scaleY));
          const w = Math.max(0.25, Math.min(slideW - x, item.width * scaleX + 0.08));
          const h = Math.max(0.22, Math.min(slideH - y, (item.height || 10) * scaleY + 0.08));
          const fontSize = Math.max(7, Math.min(30, (item.height || 10) * 0.75));
          slide.addText(item.text, { x, y, w, h, fontSize, color: '111827', margin: 0, breakLine: false });
          textBoxes++;
        }
      }
    }
    if (!ctx.isCurrent()) return;

    ctx.setStatus('Writing PowerPoint file…', 'info');
    const buffer = await pptx.write({ outputType: 'arraybuffer' });
    if (!ctx.isCurrent()) return;
    const pptxBytes = new Uint8Array(buffer);

    deliver(ctx, {
      bytes: pptxBytes,
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      filename: `${safeName(file.name)}-converted.pptx`,
      detail: 'Editable text is approximated from PDF text positions; pages without selectable text are inserted as images. Graphics, images and vector art on text pages are not carried over, so this is not an exact visual copy.',
      stats: [`Input: ${ctx.fmtBytes(file.size)}`, `Output: ${ctx.fmtBytes(pptxBytes.byteLength)}`, `Slides: ${pages.length}`, `Text boxes: ${textBoxes}`, `Scanned pages: ${scannedPages}`]
    });
  },

  'html-to-pdf': async (ctx) => {
    let html;
    let source;
    if (ctx.file) {
      const file = requireInput(ctx.file, ['html', 'htm', 'txt'], 'HTML to PDF');
      ctx.setStatus('Reading HTML source…', 'info');
      const bytes = await bytesOf(file);
      if (!ctx.isCurrent()) return;
      const utf8 = new TextDecoder('utf-8').decode(bytes);
      const declared = utf8.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1];
      try {
        html = declared && !/^utf-?8$/i.test(declared) ? new TextDecoder(declared).decode(bytes) : utf8;
      } catch {
        html = utf8;
      }
      source = file.name;
    } else {
      html = String(ctx.$('#html-input')?.value || '');
      if (!html.trim()) throw new Error('Paste HTML into the text box or choose an .html, .htm or .txt file.');
      source = 'Pasted HTML';
    }
    if (!ctx.isCurrent()) return;

    const title = ctx.$('#doc-title')?.value?.trim() || 'HTML document';
    ctx.setStatus('Rendering HTML as PDF pages…', 'info');
    const pdfBytes = await htmlToPdfBytes(html, { title });
    if (!ctx.isCurrent()) return;
    const pdf = await PDFDocument.load(pdfBytes);
    if (!ctx.isCurrent()) return;

    deliver(ctx, {
      bytes: pdfBytes,
      mime: PDF_MIME,
      filename: ctx.file ? `${safeName(ctx.file.name)}-converted.pdf` : 'html-document.pdf',
      detail: 'HTML was sanitised and rendered into real PDF pages in this browser. Pages are image-based, so text is not selectable or searchable; remote images are not loaded.',
      stats: [`Source: ${source.slice(0, 60)}`, `Output: ${ctx.fmtBytes(pdfBytes.byteLength)}`, `Pages: ${pdf.getPageCount()}`]
    });
  },

  'pdf-to-pdfa': async (ctx) => {
    const file = requireInput(ctx.file, ['pdf'], 'PDF/A preparation');
    ctx.setStatus('Cleaning PDF structure…', 'info');
    const { doc } = await openPdf(file);
    if (!ctx.isCurrent()) return;

    let javascriptRemoved = false;
    let embeddedFilesRemoved = false;
    try {
      const names = doc.catalog.lookup(PDFName.of('Names'));
      if (names?.constructor?.name === 'PDFDict' || typeof names?.delete === 'function') {
        if (names.has(PDFName.of('JavaScript'))) {
          names.delete(PDFName.of('JavaScript'));
          javascriptRemoved = true;
        }
        if (names.has(PDFName.of('EmbeddedFiles'))) {
          names.delete(PDFName.of('EmbeddedFiles'));
          embeddedFilesRemoved = true;
        }
      }
      if (doc.catalog.has(PDFName.of('JavaScript'))) {
        doc.catalog.delete(PDFName.of('JavaScript'));
        javascriptRemoved = true;
      }
      if (doc.catalog.has(PDFName.of('EmbeddedFiles'))) {
        doc.catalog.delete(PDFName.of('EmbeddedFiles'));
        embeddedFilesRemoved = true;
      }
    } catch {
      // A malformed Names dictionary should not block the rest of the cleanup.
    }

    let formsFlattened = false;
    try {
      const form = doc.getForm();
      if (form.getFields().length) {
        form.flatten();
        formsFlattened = true;
      }
    } catch {
      formsFlattened = false;
    }

    const title = baseName(file.name);
    doc.setCreator('KriXo');
    doc.setProducer('KriXo PDF/A preparation');
    doc.setTitle(title);
    doc.setCreationDate(new Date());
    doc.setModificationDate(new Date());

    try {
      const safeTitle = escapeHtmlText(title);
      const xmp = [
        '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
        `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${safeTitle}</rdf:li></rdf:Alt></dc:title>`,
        '<xmp:CreatorTool>KriXo</xmp:CreatorTool>',
        '<pdf:Producer>KriXo PDF/A preparation</pdf:Producer>',
        '</rdf:Description>',
        '</rdf:RDF>',
        '</x:xmpmeta>',
        '<?xpacket end="w"?>'
      ].join('\n');
      const metadata = doc.context.stream(xmp, { Type: PDFName.of('Metadata'), Subtype: PDFName.of('XML') });
      doc.catalog.set(PDFName.of('Metadata'), metadata);
    } catch {
      // Older PDFs may reject an XMP stream; the Info metadata above still applies.
    }
    if (!ctx.isCurrent()) return;

    ctx.setStatus('Re-saving with object streams…', 'info');
    const pdfBytes = await savePdf(doc);
    if (!ctx.isCurrent()) return;

    deliver(ctx, {
      bytes: pdfBytes,
      mime: PDF_MIME,
      filename: `${safeName(file.name)}-pdfa-ready.pdf`,
      detail: 'Structural cleanup applied. This is not certified PDF/A — validate with veraPDF or Ghostscript before official submission.',
      stats: [
        `Input: ${ctx.fmtBytes(file.size)}`,
        `Output: ${ctx.fmtBytes(pdfBytes.byteLength)}`,
        `Pages: ${doc.getPageCount()}`,
        `Forms flattened: ${formsFlattened ? 'yes' : 'no'}`,
        `Document scripts/attachments removed: ${javascriptRemoved || embeddedFilesRemoved ? 'yes' : 'none found'}`
      ]
    });
  }
};
