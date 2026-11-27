import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve('.qa/fixtures/sample-3p.pdf'));
const text = src.toString('latin1');
const xref = text.lastIndexOf('xref');
if (xref < 0) throw new Error('No xref in source PDF');
// Remove the xref table and trailer. pdf-lib rejects this; PDF.js can often recover by reconstruction.
const damaged = src.subarray(0, xref - 2);
fs.writeFileSync(path.resolve('.qa/fixtures/repairable.pdf'), damaged);
console.log('Created repairable.pdf', damaged.length, 'bytes from', src.length);
