import { defineConfig, loadEnv } from 'vite';
import { resolve, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const rootDir = fileURLToPath(new URL('.', import.meta.url));

/* Every HTML page is a build entry, so new tools do not need a config edit. */
function htmlInputs(dir, prefix = '') {
  const inputs = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(inputs, htmlInputs(full, `${prefix}${entry.name}-`));
    else if (entry.name.endsWith('.html')) inputs[`${prefix}${entry.name.replace(/\.html$/, '')}`] = full;
  }
  return inputs;
}
export default defineConfig(({ mode }) => {
  // Read PORT from .env so the dev proxy follows the Express server configuration.
  const env = loadEnv(mode, rootDir, '');
  const backendTarget = `http://localhost:${Number(env.PORT || 3000) || 3000}`;
  return {
    define: { global: 'globalThis' },
    root: 'public',
    publicDir: false,
    /* PDFKit's blob-stream needs Node stream/util shims in the browser. */
    resolve: {
      alias: {
        stream: 'stream-browserify',
        util: 'util/',
        buffer: 'buffer/',
        events: 'events/',
        process: 'process/browser'
      }
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: htmlInputs(resolve(rootDir, 'public'))
      }
    },
    server: {
      port: 5173,
      /* Guides are static source pages here; proxying them would serve the built
         HTML with hashed assets that the dev server cannot resolve. */
      proxy: { '/api': backendTarget, '/sitemap.xml': backendTarget, '/robots.txt': backendTarget }
    }
  };
});
