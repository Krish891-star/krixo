import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const outDir = 'C:/Users/DELL G15/AppData/Local/Temp/opencode/krixo-test';
await mkdir(outDir, { recursive: true });

async function build(filename, changed) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('KriXo sample document', { x: 72, y: 730, size: 20, font });
  page.drawText(changed ? 'Alpha line one has changed' : 'Alpha line one', { x: 72, y: 690, size: 14, font });
  page.drawText('Secret account number 123456', { x: 72, y: 660, size: 14, font });
  page.drawRectangle({ x: 72, y: 600, width: 220, height: 30, color: rgb(0.85, 0.18, 0.18) });
  const second = doc.addPage([612, 792]);
  second.drawText('Second page', { x: 72, y: 730, size: 18, font });
  second.drawText('Beta line two', { x: 72, y: 690, size: 14, font });
  await writeFile(`${outDir}/${filename}`, await doc.save());
  console.log(`${filename}`);
}

await build('sample-text.pdf', false);
await build('sample-text-changed.pdf', true);
