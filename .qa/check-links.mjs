import { existsSync } from 'node:fs';
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

const broken = [];
const seen = new Map();
let checked = 0;
for (const file of await walk(dist)) {
  const html = await readFile(file, 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map(match => match[1]);
  for (const ref of refs) {
    if (ref.startsWith('//')) continue;
    const clean = ref.split(/[?#]/, 1)[0];
    if (!clean) continue;
    let local = decodeURIComponent(clean);
    if (local === '/' || local.endsWith('/')) local += 'index.html';
    let target = path.join(dist, local.replace(/^\/+/, ''));
    if (!existsSync(target) && !path.extname(target)) {
      if (existsSync(`${target}.html`)) target = `${target}.html`;
      else if (existsSync(path.join(target, 'index.html'))) target = path.join(target, 'index.html');
    }
    checked++;
    if (!existsSync(target)) broken.push(`${path.relative(dist, file)} -> ${ref}`);
    seen.set(ref, (seen.get(ref) || 0) + 1);
  }
}
console.log(`checked ${checked} internal references across ${seen.size} unique targets`);
if (broken.length) {
  console.log(`BROKEN (${broken.length}):`);
  for (const item of broken.slice(0, 40)) console.log(' - ' + item);
  process.exitCode = 1;
} else {
  console.log('BROKEN: 0');
}
