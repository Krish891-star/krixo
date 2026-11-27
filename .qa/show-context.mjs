import fs from 'node:fs';

const jobs = [
  ['public/tools/rotate-pdf.html', 'Organize PDF Pages tool'],
  ['public/tools/split-pdf.html', 'ascending order'],
  ['public/tools/pdf-to-jpg.html', 'JPG or PNG images'],
  ['public/tools/pdf-to-pdfa.html', 'Prepare a PDF for PDF/A archiving']
];
for (const [file, needle] of jobs) {
  const html = fs.readFileSync(file, 'utf8');
  const i = html.indexOf(needle);
  console.log(file, '::', JSON.stringify(html.slice(Math.max(0, i - 120), i + needle.length + 120)));
}
