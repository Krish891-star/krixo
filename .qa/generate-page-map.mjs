import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile('SEO-KEYWORD-MAP.md', 'utf8');
const rows = source.split('\n').filter(line => line.startsWith('| ') && line.includes('`/tools/'));

const fixed = {
  'split-pdf': 'FIXED: H1/description/FAQ now state that ranges produce one PDF; do not claim multiple output files.',
  'extract-pdf-pages': 'FIXED: description states individual pages produce one PDF; keep copy distinct from split-pdf.',
  'image-converter': 'FIXED: title and H1 list JPG, PNG, WebP, GIF and BMP explicitly.',
  'rotate-pdf': 'FIXED: FAQ now confirms per-page thumbnail rotation instead of denying it.',
  'jpg-to-pdf': 'FIXED: removed the inaccurate "first version is free" wording.',
  'merge-pdf': 'FIXED: unlock-pdf is now linked from the password FAQ.',
  'image-compressor': 'FIXED: file-checker is now linked from the dimension FAQ.'
};

const groupNote = id => {
  if (id.includes('image') || id.includes('photo') || id === 'file-checker') return 'Keep exact KB/px intent; show accepted formats, maximum size/count and honest failure states.';
  if (id.includes('to-') || id.includes('-to-')) return 'Own only this source→output pair; link to the correct sibling for the reverse conversion.';
  if (id.includes('pdf')) return 'Keep one page-selection or document intent; state exactly what changes and what stays untouched.';
  return 'Keep one intent and one primary keyword; link to the relevant checker/guide where appropriate.';
};

const lines = [];
lines.push('# KriXo — page-by-page SEO map');
lines.push('');
lines.push('Status key: `FIXED` = changed in this workspace and rebuilt; `RECOMMENDED` = no code change made in this pass. No search-volume data was available, so priorities use intent and estimated difficulty only.');
lines.push('');
lines.push('| Page | Primary keyword | Intent | Difficulty (est.) | Status / next action |');
lines.push('|---|---|---|---|---|');
for (const row of rows) {
  const cells = row.split('|').slice(1, -1).map(c => c.trim());
  const page = cells[1].replace(/`/g, '');
  const id = page.split('/').pop().replace('.html', '');
  const primary = cells[2];
  const intent = cells[5];
  const difficulty = cells[7];
  const note = fixed[id] ? `**${fixed[id]}**` : `RECOMMENDED: ${groupNote(id)}`;
  lines.push(`| \`${page}\` | ${primary} | ${intent} | ${difficulty} | ${note} |`);
}
lines.push('');
lines.push('## Non-tool pages');
lines.push('');
lines.push('| Page | Status / next action |');
lines.push('|---|---|');
lines.push('| `/` | FIXED: English title, H1, hero copy and hero search placeholder now match `lang="en"`; section heading changed from "Popular Tools" to "All Tools". Recommended: add a short indexed text block above the tool grid with the main category links. |');
lines.push('| `/formats.html` | REMOVED: taken out of nav, footer, generator, sitemap and build; no longer linked. |');
lines.push('| `/workspaces/` and `/workspaces/*.html` | REMOVED: category hubs taken out of nav, footer, generator, sitemap and build; all 39 tools remain directly reachable from "All Tools". |');
lines.push('| `/guides/` | RECOMMENDED: expand the three existing guides and add requirement-checker explainers; do not target tool transaction terms here. |');
lines.push('| `/about.html`, `/privacy.html`, `/terms.html`, `/contact.html` | RECOMMENDED: keep `noindex` only if they have no search value; privacy/contact can be indexed if they contain unique trust information. |');
lines.push('| `/404.html`, `/admin.html`, `/guides/article.html`, `/guides/index.html` | FIXED: excluded from canonical injection; 404 uses `noindex,nofollow`. |');
lines.push('');
lines.push('## Verified checks after this pass');
lines.push('');
lines.push('- 39 tool URLs in the catalog; 0 duplicate IDs, paths or names.');
lines.push('- 39/39 tool-card links on the rendered homepage; 0 duplicate hrefs.');
lines.push('- 551 internal static references checked in `dist`; 0 broken targets.');
lines.push('- 27/27 pro tool handlers and 12/12 core tool dispatch paths present.');
lines.push('- 58 sitemap URLs with `<lastmod>`; 57 in-document canonical fallbacks; no canonical on noindex/template pages.');

await writeFile('SEO-PAGE-MAP.md', lines.join('\n') + '\n', 'utf8');
console.log('wrote SEO-PAGE-MAP.md with ' + rows.length + ' tool rows');
