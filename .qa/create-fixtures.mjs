// Local QA fixture generator. Generates real, valid sample files for end-to-end tool testing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document as DocxDocument, Packer as DocxPacker, Paragraph, TextRun } from 'docx';
import XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';

const out = path.resolve('.qa/fixtures');
await fs.mkdir(out, { recursive: true });

async function write(name, data) {
  await fs.writeFile(path.join(out, name), data);
  console.log(name, data.length);
}

// 3-page PDF with selectable text, coordinates and an image-free layout.
{
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`KriXo QA sample PDF`, { x: 50, y: 790, size: 20, font, color: rgb(0.1, 0.2, 0.5) });
    page.drawText(`Page ${i} of 3. Alpha beta gamma. Row 1, Column 1`, { x: 50, y: 740, size: 12, font });
    page.drawText(`Unique marker P${i}-MARKER-42`, { x: 50, y: 710, size: 12, font });
    page.drawRectangle({ x: 50, y: 650, width: 200, height: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  }
  await write('sample-3p.pdf', await pdf.save());
}

// 1-page PDF, used for merge order checks.
{
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  page.drawText('MERGE B - second document', { x: 30, y: 300, size: 16, font });
  await write('merge-b.pdf', await pdf.save());
}

// Single-page PDF with a small pixel PNG embedded (for image extraction tests).
{
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  page.drawText('IMAGE PAGE', { x: 30, y: 350, size: 18, font });
  // 2x2 red PNG
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8DAwMDAxMDAwAAAFQwBAYlUZXwAAAAASUVORK5CYII=';
  const img = await pdf.embedPng(Buffer.from(pngBase64, 'base64'));
  page.drawImage(img, { x: 40, y: 100, width: 100, height: 100 });
  await write('image-page.pdf', await pdf.save());
}

// DOCX with text and a table.
{
  const doc = new DocxDocument({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Word to PDF QA document', bold: true, size: 32 })] }),
        new Paragraph('This paragraph must survive the conversion.'),
        new Paragraph('Second line with a number: 12345.'),
      ],
    }],
  });
  await write('sample.docx', await DocxPacker.toBuffer(doc));
}

// XLSX with two sheets.
{
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Name', 'Score'], ['Alpha', 10], ['Beta', 20]]);
  const ws2 = XLSX.utils.aoa_to_sheet([['Sheet', 'Two'], ['OK', 1]]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Scores');
  XLSX.utils.book_append_sheet(wb, ws2, 'Second');
  await write('sample.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// CSV
await write('sample.csv', 'Name,Score\nAlpha,10\nBeta,20\n');

// PPTX with two slides.
{
  const pptx = new PptxGenJS();
  let slide = pptx.addSlide();
  slide.addText('Slide 1 - KriXo QA', { x: 0.5, y: 0.5, fontSize: 28 });
  slide.addText('First slide body text', { x: 0.5, y: 1.5, fontSize: 18 });
  slide = pptx.addSlide();
  slide.addText('Slide 2', { x: 0.5, y: 0.5, fontSize: 28 });
  slide.addText('Second slide body text', { x: 0.5, y: 1.5, fontSize: 18 });
  await write('sample.pptx', Buffer.from(await pptx.write({ outputType: 'nodebuffer' })));
}

// HTML, text, markdown inputs.
await write('sample.html', '<!doctype html><html><head><title>QA HTML</title></head><body><h1>HTML to PDF</h1><p>Paragraph from HTML file.</p></body></html>');
await write('sample.txt', 'Plain text fixture for file checker.\n');
await write('sample.md', '# Heading\n\nMarkdown body.\n');

// Real GIF (1x1 transparent) and BMP (2x2 blue) fixtures.
await write('sample.gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'));
{
  const w = 2, h = 2, row = w * 3 + ((w * 3) % 4 ? 4 - ((w * 3) % 4) : 0);
  const data = Buffer.alloc(54 + row * h);
  data.write('BM', 0);
  data.writeUInt32LE(data.length, 2);
  data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14);
  data.writeInt32LE(w, 18);
  data.writeInt32LE(h, 22);
  data.writeUInt16LE(1, 26);
  data.writeUInt16LE(24, 28);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = 54 + y * row + x * 3;
    data[o] = 0x40; data[o + 1] = 0x80; data[o + 2] = 0xf0;
  }
  await write('sample.bmp', data);
}

// Invalid / edge-case inputs.
await write('empty.pdf', Buffer.alloc(0));
await write('corrupt.pdf', Buffer.from('%PDF-1.4\nthis is not a valid pdf\n%%EOF\n'));
await write('fake.docx', Buffer.from('not really a docx'));
await write('wrong-extension.pdf', Buffer.from('hello world'));

console.log('Fixtures written to', out);
