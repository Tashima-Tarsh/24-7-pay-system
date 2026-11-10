import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
const PUBLIC_DIR = path.join(rootDir, 'public');

const PORT = Number(process.env.PORT || 7000);
const API_PORT = 6100;
const API_HOST = '127.0.0.1';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Ensure required security environment variables are set in production.
// Fail boot if any are missing or use unsafe defaults — never silently
// generate replacements that would invalidate existing encrypted data.
const REQUIRED_SECRET_VARS = ['ENCRYPTION_MASTER_KEY', 'JWT_SECRET', 'ORDER_SIGNING_SECRET'];
const UNSAFE_DEFAULTS = new Set([
  'youpi_jwt_secret_change_in_production_min_32_chars_long',
  'AdminSecurePassword123!',
  'android_pairing_enrollment_secret_key_32_chars',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

function isUnsafeOrMissing(value) {
  return !value || value.length < 32 || UNSAFE_DEFAULTS.has(value);
}

for (const key of REQUIRED_SECRET_VARS) {
  const val = process.env[key];
  if (IS_PRODUCTION && isUnsafeOrMissing(val)) {
    console.error(`[FATAL] Production requires a valid persistent ${key}. Set it in Render environment and restart.`);
    process.exit(1);
  }
}

// Preserve development/test defaults only when not in production.
if (!IS_PRODUCTION) {
  process.env.ENCRYPTION_MASTER_KEY ||= crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
  process.env.ORDER_SIGNING_SECRET ||= crypto.randomBytes(32).toString('hex');
}

process.env.INITIAL_ADMIN_EMAIL ||= 'admin@247pay.local';
process.env.INITIAL_ADMIN_PASSWORD ||= crypto.randomBytes(16).toString('hex');

// Production storage guard: refuse financial writes if ephemeral SQLite.
const DATABASE_URL = process.env.DATABASE_URL;
const USES_POSTGRES = Boolean(DATABASE_URL && /^postgres(?:ql)?:\/\//i.test(DATABASE_URL));

if (IS_PRODUCTION && !USES_POSTGRES) {
  console.error('[FATAL] Production requires DATABASE_URL pointing to PostgreSQL. Ephemeral SQLite is unsafe for financial data.');
  process.exit(1);
}

// Ensure data directory exists for SQLite (dev/test only)
const dbPath = process.env.SQLITE_DB_PATH || path.join(rootDir, 'data', 'youpi_pg.sqlite');
if (!USES_POSTGRES) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

// Start backend payment API directly in-process
let apiServer = null;
try {
  const { startServer } = await import('./apps/payment-api/src/index.js');
  apiServer = await startServer(API_PORT);
  console.log(`[server] Payment API started on port ${apiServer.port || API_PORT}`);
  // Safe operational fingerprint: backend type only, never credentials.
  console.log('[server] Payment storage backend:', apiServer.app?.context?.db?.dialect === 'postgres' ? 'postgres' : 'sqlite');
} catch (err) {
  console.error('[server] Failed to start Payment API in-process:', err);
}

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
  if (pathname === '/legacy-console') {
    return 'legacy-workspace';
  }
  if (pathname === '/admin' || pathname === '/merchant' || pathname === '/platform' || pathname === '/dashboard' || pathname === '/super-admin') {
    return 'workspace';
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
    const apiOnline = Boolean(apiServer);
    const durableStorage = apiServer?.app?.context?.db?.dialect === 'postgres';
    // /health checks the web process; /_ready checks real-money readiness.
    const ready = apiOnline && (pathname === '/health' || process.env.NODE_ENV !== 'production' || durableStorage);
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: ready,
      status: ready ? 'UP' : 'DEGRADED',
      apiOnline,
      financialReady: apiOnline && (process.env.NODE_ENV !== 'production' || durableStorage),
      storage: durableStorage ? 'postgres' : 'sqlite'
    }));
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
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('landing.html not found');
    }
    return;
  }

  // QR endpoint: /checkout/<id>/qr.svg returns the session's UPI QR code
  const qrMatch = pathname.match(/^\/checkout\/([^/]+)\/qr\.svg$/);
  if (qrMatch) {
    const paymentId = qrMatch[1];
    // Proxy to payment API for QR generation
    streamPipe(req, res, API_HOST, API_PORT, `/api/v1/checkout/${encodeURIComponent(paymentId)}/upi-qr`);
    return;
  }

  if (route === 'checkout') {
    try {
      const html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'checkout-next.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('checkout.html not found');
    }
    return;
  }

  if (route === 'workspace' || route === 'legacy-workspace') {
    try {
      const html = await fs.promises.readFile(path.join(PUBLIC_DIR, route === 'workspace' ? 'premium-studio/index.html' : 'platform.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Workspace unavailable');
    }
    return;
  }

  if (route === 'admin') {
    try {
      const html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'admin.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('admin.html not found');
    }
    return;
  }

  // Static files from public/
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname); }
  catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid file path');
    return;
  }
  const safePath = path.resolve(PUBLIC_DIR, decodedPath.replace(/^\/+/, ''));
  if (safePath !== PUBLIC_DIR && !safePath.startsWith(PUBLIC_DIR + path.sep)) {
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

const shutdown = async () => {
  console.log('[server] Shutting down cleanly...');
  server.close();
  if (apiServer?.close) {
    try { await apiServer.close(); } catch {}
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
