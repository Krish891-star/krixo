import 'dotenv/config';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const configuredSite = (process.env.SITE_URL || process.env.APP_URL || '').trim();
const rawSite = configuredSite && !/localhost|127\.0\.0\.1/i.test(configuredSite)
  ? configuredSite
  : 'https://krixo.netlify.app';
const site = rawSite.replace(/\/+$/, '');

const toolDir = path.join(distDir, 'tools');
const toolFiles = (await readdir(toolDir)).filter(name => name.endsWith('.html')).sort();
const toolRoutes = toolFiles.map(name => `/tools/${name.replace(/\.html$/i, '')}`);

/* These are the only pages intended for search indexing. Routes use Netlify's
   clean-URL form (without .html), matching the canonical URLs served live. */
const sitemapPaths = [
  '/', '/pdf-tools/', '/image-tools/',
  ...toolRoutes,
  '/guides/',
  '/guides/check-photo-before-upload',
  '/guides/kb-vs-pixels',
  '/guides/pdf-compression-quality',
  '/about', '/contact', '/privacy', '/terms'
];
const noindexPaths = new Set(['/admin', '/guides/article', '/404']);

if (new Set(sitemapPaths).size !== sitemapPaths.length) {
  throw new Error('Duplicate route in sitemapPaths');
}
for (const route of sitemapPaths) {
  if (noindexPaths.has(route)) throw new Error(`Noindex route included in sitemap: ${route}`);
}

function routeToFile(route) {
  if (route === '/') return path.join(distDir, 'index.html');
  if (route.endsWith('/')) return path.join(distDir, route.slice(1), 'index.html');
  return path.join(distDir, `${route.slice(1)}.html`);
}
function routeFromFile(relativePath) {
  const clean = relativePath.replace(/\\/g, '/');
  if (clean === 'index.html') return '/';
  if (clean.endsWith('/index.html')) return `/${clean.slice(0, -'index.html'.length)}`;
  return `/${clean.replace(/\.html$/i, '')}`;
}
function decodeEntities(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return match;
  });
}
function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function walkHtml(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkHtml(target));
    else if (entry.name.endsWith('.html')) out.push(target);
  }
  return out;
}

await mkdir(distDir, { recursive: true });

/* Validate every sitemap route against a real HTML output before writing it. */
for (const route of sitemapPaths) {
  const file = routeToFile(route);
  try {
    await readFile(file, 'utf8');
  } catch {
    throw new Error(`Sitemap route has no built HTML file: ${route} -> ${file}`);
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map(route => `  <url><loc>${esc(`${site}${route}`)}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(distDir, 'sitemap.xml'), sitemap, 'utf8');

const robots = `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`;
await writeFile(path.join(distDir, 'robots.txt'), robots, 'utf8');

const sharedHeaders = [
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  '  X-Frame-Options: DENY',
  "  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-BkKP2XO6WOEc3kXOiLr2ZoY83hamalKjPY9xBcbXVuw='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
].join('\n');
const noindexHeaderRules = [
  '/admin', '/admin.html',
  '/guides/article', '/guides/article.html',
  '/404', '/404.html'
].map(route => `${route}\n  X-Robots-Tag: noindex, nofollow`).join('\n\n');
await writeFile(path.join(distDir, '_headers'), `/*\n${sharedHeaders}\n\n${noindexHeaderRules}\n`, 'utf8');

const organization = {
  '@type': 'Organization',
  '@id': `${site}/#organization`,
  name: 'KriXo',
  url: `${site}/`,
  logo: { '@type': 'ImageObject', url: `${site}/favicon-512x512.png`, width: 512, height: 512 }
};
const website = {
  '@type': 'WebSite',
  '@id': `${site}/#website`,
  name: 'KriXo',
  url: `${site}/`,
  publisher: { '@id': `${site}/#organization` },
  inLanguage: 'en'
};

let canonicalCount = 0;
let noindexCount = 0;
let schemaCount = 0;
const htmlFiles = await walkHtml(distDir);
for (const file of htmlFiles) {
  const relativePath = path.relative(distDir, file).replace(/\\/g, '/');
  const route = routeFromFile(relativePath);
  let html = await readFile(file, 'utf8');
  const isNoindex = noindexPaths.has(route);
  const title = decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '');
  const description = decodeEntities(html.match(/<meta\s+name="description"\s+content="([^"]*)"\s*\/?\s*>/i)?.[1]?.trim() || '');

  if (isNoindex) {
    html = html.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '');
    html = html.replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>/gi, '');
    html = html.replace(/<script\b[^>]*data-krixo-schema[^>]*>[\s\S]*?<\/script>/gi, '');
    const robotsTag = '<meta name="robots" content="noindex,nofollow">';
    html = html.replace(/<\/head>/i, `${robotsTag}</head>`);
    noindexCount++;
    await writeFile(file, html, 'utf8');
    continue;
  }

  if (!title || !description) {
    throw new Error(`Indexable page missing title or description: ${relativePath}`);
  }
  const canonical = `${site}${route}`;
  html = html.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '');
  html = html.replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>/gi, '');
  html = html.replace(/<meta\b[^>]*\bproperty=["']og:[^"']+["'][^>]*>/gi, '');
  html = html.replace(/<meta\b[^>]*\bname=["']twitter:[^"']+["'][^>]*>/gi, '');
  html = html.replace(/<script\b[^>]*data-krixo-schema[^>]*>[\s\S]*?<\/script>/gi, '');

  const metaTags = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="KriXo">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(`${site}/favicon-512x512.png`)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(`${site}/favicon-512x512.png`)}">`
  ].join('');
  html = html.replace(/<\/head>/i, `${metaTags}</head>`);
  canonicalCount++;

  const h1 = decodeEntities(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || title);
  const graph = [];
  if (route === '/') {
    graph.push(website, organization);
    graph.push({
      '@type': 'ItemList',
      '@id': `${site}/#tool-list`,
      name: 'KriXo online PDF and image tools',
      itemListElement: toolRoutes.map((toolRoute, index) => ({
        '@type': 'ListItem', position: index + 1,
        url: `${site}${toolRoute}`
      }))
    });
  } else if (route === '/pdf-tools/' || route === '/image-tools/') {
    graph.push({
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: h1,
      description,
      url: canonical,
      isPartOf: { '@id': `${site}/#website` },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: toolRoutes
          .filter(toolRoute => route === '/pdf-tools/' ? !['image-compressor','image-converter','image-resizer','photo-signature-resizer','file-checker'].some(id => toolRoute === `/tools/${id}`) : ['image-compressor','image-converter','image-resizer','photo-signature-resizer','file-checker','jpg-to-pdf','pdf-to-jpg'].some(id => toolRoute === `/tools/${id}`))
          .map((toolRoute, index) => ({ '@type': 'ListItem', position: index + 1, url: `${site}${toolRoute}` }))
      }
    });
  } else if (route.startsWith('/tools/')) {
    const categoryRoute = ['image-compressor','image-converter','image-resizer','photo-signature-resizer','file-checker'].some(id => route === `/tools/${id}`) ? '/image-tools/' : '/pdf-tools/';
    graph.push({
      '@type': 'WebPage', '@id': `${canonical}#webpage`, name: h1,
      description, url: canonical, isPartOf: { '@id': `${site}/#website` },
      mainEntity: { '@id': `${canonical}#app` }
    });
    graph.push({
      '@type': 'WebApplication', '@id': `${canonical}#app`, name: h1,
      description, url: canonical, applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any modern web browser', browserRequirements: 'JavaScript enabled',
      isAccessibleForFree: true, provider: { '@id': `${site}/#organization` }
    });
    graph.push({
      '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: categoryRoute === '/image-tools/' ? 'Image Tools' : 'PDF Tools', item: `${site}${categoryRoute}` },
        { '@type': 'ListItem', position: 3, name: h1, item: canonical }
      ]
    });
  } else if (route.startsWith('/guides/')) {
    graph.push({ '@type': 'WebPage', '@id': `${canonical}#webpage`, name: h1, description, url: canonical, isPartOf: { '@id': `${site}/#website` } });
    graph.push({
      '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${site}/guides/` },
        { '@type': 'ListItem', position: 3, name: h1, item: canonical }
      ]
    });
  } else {
    graph.push({ '@type': 'WebPage', '@id': `${canonical}#webpage`, name: h1, description, url: canonical, isPartOf: { '@id': `${site}/#website` } });
  }
  const jsonLd = `<script type="application/ld+json" data-krixo-schema>${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/<\//g, '<\\/')}</script>`;
  html = html.replace(/<\/head>/i, `${jsonLd}</head>`);
  schemaCount++;
  await writeFile(file, html, 'utf8');
}

/* Sitemap routes must all be indexable and have one matching canonical. */
if (canonicalCount < sitemapPaths.length) {
  throw new Error(`Expected at least ${sitemapPaths.length} canonical pages, generated ${canonicalCount}`);
}
console.log(`[generate-seo] ${sitemapPaths.length} clean sitemap URLs; ${canonicalCount} absolute canonicals; ${schemaCount} JSON-LD graphs; ${noindexCount} noindex pages.`);
