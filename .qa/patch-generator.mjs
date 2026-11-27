import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const file = 'scripts/generate-new-tool-pages.mjs';
let src = await readFile(file, 'utf8');
const oldRender = 'function render(page) {\n  const controls = page.controls ? `<div class="form-grid">${page.controls}</div>` : \'\';\n  const extraButtons = page.extraButtons || \'\';\n  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f7f2"><title>${esc(page.title)} — KriXo</title>';
const newRender = 'function render(page) {\n  const controls = page.controls ? `<div class="form-grid">${page.controls}</div>` : \'\';\n  const extraButtons = page.extraButtons || \'\';\n  const canonical = `<link rel="canonical" href="/tools/${page.id}.html">`;\n  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${canonical}<meta name="theme-color" content="#f7f7f2"><title>${esc(page.title)} — KriXo</title>';
if (!src.includes(oldRender)) throw new Error('render() pattern not found');
src = src.replace(oldRender, newRender);
await writeFile(file, src, 'utf8');
console.log('[generator] added static canonical to new-tool page template');
