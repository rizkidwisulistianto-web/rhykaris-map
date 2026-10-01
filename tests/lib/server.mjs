// Tiny static file server for the tests. Serves the repository root under a sub-path
// (default "/rhykaris-map/") to mimic GitHub Pages project sites, and also redirects "/" there.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8',
};

export function startServer({ base = '/rhykaris-map/', port = 0, root = ROOT } = {}) {
  const log = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    log.push({ path: p, t: Date.now() });
    if (p === '/' && base !== '/') { res.writeHead(302, { Location: base }); res.end(); return; }
    if (!p.startsWith(base)) { res.writeHead(404); res.end('not found'); return; }
    let rel = p.slice(base.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => {
    const { port: pt } = srv.address();
    resolve({ url: `http://127.0.0.1:${pt}${base}`, origin: `http://127.0.0.1:${pt}`, base, log, close: () => new Promise((r) => srv.close(r)) });
  }));
}
