import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const src = fs.readFileSync(path.resolve('.qa/fixtures/sample-3p.pdf'));
const text = src.toString('latin1');
const xref = text.lastIndexOf('xref');
const head = text.slice(0, xref);
const tail = text.slice(xref).replace(/\b\d{10}\b/g, '0000000000');
const data = Buffer.from(head + tail, 'latin1');
fs.writeFileSync(path.resolve('.qa/fixtures/repair-badxref.pdf'), data);
let status = 'ok';
try { await PDFDocument.load(data); } catch (e) { status = 'pdf-lib fail: ' + e.message.slice(0, 100); }
console.log('repair-badxref.pdf', data.length, status);
