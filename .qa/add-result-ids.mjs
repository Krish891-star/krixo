import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/tools');
let changed = 0;
for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.html'))) {
  const file = path.join(dir, name);
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('id="result-card"') || html.includes('id="result-icon"')) continue;
  const start = html.indexOf('id="result-card"');
  const marker = '<span aria-hidden="true">✓</span>';
  const index = html.indexOf(marker, start);
  if (index < 0) continue;
  html = html.slice(0, index) + '<span id="result-icon" class="result-icon" aria-hidden="true">✓</span>' + html.slice(index + marker.length);
  fs.writeFileSync(file, html, 'utf8');
  changed++;
}
console.log(`Added result-icon to ${changed} tool pages.`);
