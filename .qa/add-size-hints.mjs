import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/tools');
let changed = 0;
for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.html'))) {
  const file = path.join(dir, name);
  let html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('id="dropzone-sub">');
  if (start < 0) continue;
  const end = html.indexOf('</p>', start);
  if (end < 0) continue;
  const text = html.slice(start, end);
  if (/MB|KB/i.test(text)) continue;
  const updated = text + ' · max 45 MB per file';
  html = html.slice(0, start) + updated + html.slice(end);
  fs.writeFileSync(file, html, 'utf8');
  changed++;
}
console.log(`Added size hints to ${changed} tool pages.`);
