import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('public');
const excluded = new Set(['404.html', 'admin.html', 'guides/article.html', 'guides/index.html']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const files = await walk(root);
let patched = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (excluded.has(rel)) continue;
  let html = await readFile(file, 'utf8');
  if (/<link[^>]+rel="canonical"/i.test(html)) continue;
  const canonicalPath = rel === 'index.html' ? '/' : '/' + rel;
  const tag = '<link rel="canonical" href="' + canonicalPath + '">';
  const match = html.match(/<meta name="viewport"[^>]*>/i);
  if (!match) throw new Error('No viewport tag in ' + rel);
  html = html.replace(match[0], match[0] + tag);
  await writeFile(file, html, 'utf8');
  patched++;
}
console.log('[canonicals] patched ' + patched + ' of ' + files.length + ' public HTML files');
