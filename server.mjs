import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
const PUBLIC_DIR = path.join(rootDir, 'public');

const PORT = Number(process.env.PORT || 7000);
const API_PORT = 6100;
const API_HOST = '127.0.0.1';

// Ensure data directory exists for SQLite
const dbPath = process.env.SQLITE_DB_PATH || path.join(rootDir, 'data', 'youpi_pg.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let apiChild = null;

function spawnApi() {
  apiChild = spawn(process.execPath, ['apps/payment-api/src/index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PAYMENT_API_PORT: String(API_PORT),
      NODE_ENV: process.env.NODE_ENV || 'production',
      YOUPI_BIND_HOST: '127.0.0.1',
      SQLITE_DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiChild.stdout.on('data', (d) => process.stdout.write(`[api] ${d}`));
  apiChild.stderr.on('data', (d) => process.stderr.write(`[api-err] ${d}`));
  apiChild.on('close', (code) => {
    console.error(`[api] exited with code ${code}`);
    apiChild = null;
  });
}

spawnApi();

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

function streamPipe(req, res, targetHost, targetPort, targetPath) {
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers },
    rejectUnauthorized: false,
  };
  delete options.headers.host;
  const upstream = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream_error', detail: err.message }));
    }
  });
  req.pipe(upstream);
}

function resolveRoute(pathname) {
  if (pathname === '/_ready' || pathname === '/health') {
    return 'health';
  }
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/events/') ||
    pathname.startsWith('/v1/') ||
    pathname.startsWith('/v1.0/') ||
    pathname.startsWith('/oauth/') ||
    pathname.startsWith('/qr/') ||
    pathname.startsWith('/sdk/') ||
    pathname === '/youpi.js'
  ) {
    return 'api';
  }
  if (pathname === '/') {
    return 'landing';
  }
  if (pathname === '/checkout' || pathname.startsWith('/checkout/')) {
    return 'checkout';
  }
  if (pathname === '/admin') {
    return 'admin';
  }
  if (pathname === '/merchant') {
    return 'merchant';
  }
  return 'static';
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_url' }));
    return;
  }

  const route = resolveRoute(pathname);

  // Health check
  if (route === 'health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, status: 'UP' }));
    return;
  }

  // API / events proxy (preserves query params)
  if (route === 'api') {
    streamPipe(req, res, API_HOST, API_PORT, req.url);
    return;
  }

  // Page routes - serve HTML
  if (route === 'landing') {
    try {
      const html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'landing.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('landing.html not found');
    }
    return;
  }

  if (route === 'checkout') {
    try {
      const html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'checkout.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('checkout.html not found');
    }
    return;
  }

  if (route === 'admin' || route === 'merchant') {
    try {
      const html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'admin.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('admin.html not found');
    }
    return;
  }

  // Static files from public/
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const content = await fs.promises.readFile(safePath);
    res.writeHead(200, { 'Content-Type': mimeType(safePath) });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Public gateway listening on port ${PORT}`);
  console.log(`[server] Proxying API routes to http://${API_HOST}:${API_PORT}`);
});

process.on('SIGTERM', () => {
  if (apiChild) apiChild.kill('SIGTERM');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  if (apiChild) apiChild.kill('SIGINT');
  server.close(() => process.exit(0));
});
