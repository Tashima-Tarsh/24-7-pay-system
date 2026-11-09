import http from 'node:http';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 7000);
const API_PORT = 6100;
const API_HOST = '127.0.0.1';
const PUBLIC_DIR = new URL('./public/', import.meta.url).pathname;

let apiChild = null;

function spawnApi() {
  apiChild = spawn(process.execPath, ['apps/payment-api/src/index.js'], {
    env: {
      ...process.env,
      PAYMENT_API_PORT: String(API_PORT),
      NODE_ENV: process.env.NODE_ENV || 'production',
      YOUPI_BIND_HOST: '127.0.0.1',
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
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
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

function readFilePromise(p) {
  return new Promise((resolve, reject) => {
    import('node:fs').then((fs) => {
      fs.promises.readFile(p).then(resolve).catch(reject);
    });
  });
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
  if (pathname.startsWith('/api/') || pathname.startsWith('/events/')) {
    return 'api';
  }
  if (pathname === '/') {
    return 'checkout';
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

  // Health
  if (route === 'health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // API / events proxy
  if (route === 'api') {
    streamPipe(req, res, API_HOST, API_PORT, pathname);
    return;
  }

  // Page routes - serve HTML
  if (route === 'checkout') {
    const html = await readFilePromise(new URL('./checkout.html', PUBLIC_DIR)).catch(() => null);
    if (html) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('checkout.html not found');
    }
    return;
  }

  if (route === 'admin') {
    const html = await readFilePromise(new URL('./admin.html', PUBLIC_DIR)).catch(() => null);
    if (html) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('admin.html not found');
    }
    return;
  }

  if (route === 'merchant') {
    const html = await readFilePromise(new URL('./admin.html', PUBLIC_DIR)).catch(() => null);
    if (html) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('admin.html not found');
    }
    return;
  }

  // Static files from public/
  const filePath = new URL('.' + pathname, PUBLIC_DIR);
  try {
    const content = await readFilePromise(filePath);
    res.writeHead(200, { 'Content-Type': mimeType(pathname) });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Public gateway listening on port ${PORT}`);
  console.log(`[server] Proxying /api/* to http://${API_HOST}:${API_PORT}`);
});

process.on('SIGTERM', () => {
  if (apiChild) apiChild.kill('SIGTERM');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  if (apiChild) apiChild.kill('SIGINT');
  server.close(() => process.exit(0));
});
