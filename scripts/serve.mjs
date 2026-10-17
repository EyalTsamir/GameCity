#!/usr/bin/env node
// Serve the built city (dist/) on http://127.0.0.1:4173 and open it in the default browser.
// Dependency-free. Usage: node scripts/serve.mjs [--port 4173] [--no-open]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const argv = process.argv.slice(2);
const portArg = argv.indexOf('--port');
let port = portArg >= 0 ? parseInt(argv[portArg + 1], 10) : 4173;
const open = !argv.includes('--no-open');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html not found - run "npm run build" first.');
  process.exit(1);
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(dist, url === '/' ? 'index.html' : url));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function listen(p, triesLeft) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) listen(p + 1, triesLeft - 1);
    else {
      console.error(e);
      process.exit(1);
    }
  });
  server.listen(p, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${p}/`;
    console.log(`Tinyhaven is running at ${url}  (Ctrl+C to stop)`);
    if (open) {
      const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
      spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    }
  });
}
listen(port, 10);
