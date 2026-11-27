import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';

const dir = path.resolve('.qa/fixtures');

// Real encrypted PDF for the Unlock PDF tool.
const doc = new PDFDocument({ userPassword: 'secret123', ownerPassword: 'owner-secret' });
const chunks = [];
doc.on('data', chunk => chunks.push(chunk));
await new Promise(resolve => {
  doc.on('end', resolve);
  doc.fontSize(20).text('Encrypted QA fixture');
  doc.addPage().fontSize(14).text('Second page with a known password.');
  doc.end();
});
fs.writeFileSync(path.join(dir, 'encrypted.pdf'), Buffer.concat(chunks));

// Oversized fake PDF: valid header, 46 MB total, should be rejected by size before decoding.
const size = 46 * 1024 * 1024;
const buffer = Buffer.alloc(size, 0x20);
Buffer.from('%PDF-1.7\n').copy(buffer, 0);
fs.writeFileSync(path.join(dir, 'oversized.pdf'), buffer);
console.log('Created encrypted.pdf and oversized.pdf');
