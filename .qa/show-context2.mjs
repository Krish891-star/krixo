import fs from 'node:fs';
const jobs = [
  ['public/tools/word-to-pdf.html', 'Text and layout'],
  ['public/tools/html-to-pdf.html', 'sanitised'],
  ['public/tools/pptx-to-pdf.html', 'including text and embedded images'],
  ['public/tools/pdf-to-pptx.html', 'editable text boxes'],
  ['public/tools/pdf-to-excel.html', 'Scanned PDFs']
];
for (const [file, needle] of jobs) {
  const html = fs.readFileSync(file, 'utf8');
  const i = html.indexOf(needle);
  console.log(file, '::', JSON.stringify(html.slice(Math.max(0, i - 100), i + needle.length + 180)));
}
