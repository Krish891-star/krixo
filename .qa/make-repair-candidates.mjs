import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const src = fs.readFileSync(path.resolve('.qa/fixtures/sample-3p.pdf'));
const text = src.toString('latin1');
const xref = text.lastIndexOf('xref');
const variants = {
  'repair-v1.pdf': src.subarray(0, xref - 2),
  'repair-v2.pdf': Buffer.concat([src.subarray(0, xref - 2), Buffer.from('\ncorrupt tail without xref\n')]),
  'repair-v3.pdf': src.subarray(0, Math.floor(xref * 0.75)),
  'repair-v4.pdf': Buffer.concat([src.subarray(0, Math.floor(xref * 0.75)), Buffer.from('\n%%EOF\n')])
};
for (const [name, data] of Object.entries(variants)) {
  fs.writeFileSync(path.resolve('.qa/fixtures', name), data);
  let status = 'ok';
  try { await PDFDocument.load(data); } catch (e) { status = 'pdf-lib fail: ' + e.message.slice(0, 80); }
  console.log(name, data.length, status);
}
