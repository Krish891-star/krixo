import { readFile } from 'node:fs/promises';
const { proToolIds } = await import('../public/assets/pro-catalog.js');
const files = ['pro-convert.js', 'pro-manage.js', 'pro-extra.js'];
const keys = new Set();
for (const name of files) {
  const text = await readFile('public/assets/' + name, 'utf8');
  for (const m of text.matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*async\s*\(/g)) keys.add(m[1]);
}
const missing = [...proToolIds].filter(id => !keys.has(id));
const extra = [...keys].filter(id => !proToolIds.has(id));
console.log('proIds=' + proToolIds.size, 'handlerKeys=' + keys.size);
console.log('missing=' + JSON.stringify(missing));
console.log('extra=' + JSON.stringify(extra));
