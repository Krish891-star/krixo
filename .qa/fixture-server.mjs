// Tiny read-only static server for QA fixtures (http://localhost:4173/<name>).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('.qa/fixtures');
const types = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.html': 'text/html', '.txt': 'text/plain', '.md': 'text/markdown' };

http.createServer(async (req, res) => {
  const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
  if (!name) {
    const files = await fs.readdir(dir);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>QA fixtures</h1><p>Test files for the KriXo tool audit. Not part of the public site.</p><ul>' + files.map(f => `<li><a href="/${f}">${f}</a></li>`).join('') + '</ul>');
    return;
  }
  if (!/^[\w.-]+$/.test(name)) { res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Invalid fixture name'); return; }
  try {
    const body = await fs.readFile(path.join(dir, name));
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  } catch { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('not found'); }
}).listen(4173, '127.0.0.1', () => console.log('QA fixtures on http://localhost:4173'));
