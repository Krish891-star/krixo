import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldLinks = '<link rel="icon" href="/favicon.png"><link rel="alternate icon" href="/favicon.svg">';
const newLinks = [
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
  '<link rel="apple-touch-icon" href="/favicon-180x180.png">',
  '<link rel="manifest" href="/site.webmanifest">',
  '<link rel="alternate icon" type="image/svg+xml" href="/favicon.svg">'
].join('');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

let changed = 0;
const targets = [
  ...walk(path.join(rootDir, 'public')),
  path.join(rootDir, 'scripts', 'generate-new-tool-pages.mjs')
];

for (const file of targets) {
  if (!statSync(file, { throwIfNoEntry: false })) continue;
  const source = readFileSync(file, 'utf8');
  if (!source.includes(oldLinks)) continue;
  writeFileSync(file, source.split(oldLinks).join(newLinks));
  changed++;
  console.log(`[icons] updated ${path.relative(rootDir, file)}`);
}
console.log(`[icons] ${changed} file(s) updated`);
