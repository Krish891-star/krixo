import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const src = fs.readFileSync(path.resolve('.qa/fixtures/sample-3p.pdf'));
const text = src.toString('latin1');
const variants = {
  'damage-xref-keyword.pdf': text.replace('xref', 'XREF'),
  'damage-endobj.pdf': text.replace('endobj', 'endobX'),
  'damage-stream.pdf': text.replace('stream\n', 'xstream\n'),
  'damage-header.pdf': text.replace('%PDF-1.7', '%PDF-1.x'),
  'damage-firstobj.pdf': text.replace('1 0 obj', '1 0 obX')
};
for (const [name, value] of Object.entries(variants)) {
  const data = Buffer.from(value, 'latin1');
  fs.writeFileSync(path.resolve('.qa/fixtures', name), data);
  let status = 'ok';
  try { await PDFDocument.load(data); } catch (e) { status = 'pdf-lib fail: ' + e.message.slice(0, 90); }
  console.log(name, status);
}
