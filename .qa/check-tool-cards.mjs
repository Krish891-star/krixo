import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(target));
    else if (entry.name.endsWith('.html')) out.push(target);
  }
  return out;
}
let duplicatedPages = 0;
const globalHrefs = new Set();
for (const file of await walk(dist)) {
  const html = await readFile(file, 'utf8');
  const hrefs = [...html.matchAll(/class="tool-card" href="([^"]+)"/g)].map(m => m[1]);
  hrefs.forEach(h => globalHrefs.add(h));
  const dup = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
  if (dup.length) {
    duplicatedPages++;
    console.log(path.relative(dist, file) + ' duplicates: ' + [...new Set(dup)].join(', '));
  }
}
console.log('pages with duplicate tool cards: ' + duplicatedPages);
console.log('unique tool card hrefs across static pages: ' + globalHrefs.size);
