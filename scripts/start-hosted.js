import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isIP } from 'node:net';
import { restorePostgresFiles } from './postgres-bootstrap.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const origin = new URL(process.env.DYNAMO_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:8080').origin;
Object.assign(process.env, {
  NODE_ENV: 'production',
  YOUPI_MODE: 'localhost',
  YOUPI_BIND_HOST: '127.0.0.1',
  DYNAMO_UNIFIED_GATEWAY: 'false',
  DYNAMO_PUBLIC_URL: origin,
  BASE_CHECKOUT_URL: origin,
  BASE_PAYMENT_API_URL: origin,
});
process.env.GMAIL_REDIRECT_URI ||= origin + '/oauth/callback';
process.env.SQLITE_DB_PATH ||= path.join(root, 'data/youpi_pg.sqlite');
const dataDir = path.dirname(process.env.SQLITE_DB_PATH);
if (process.env.DATABASE_URL) await restorePostgresFiles(dataDir, process.env.DATABASE_URL);
const { hashPassword, getInternalServiceToken } = await import('@youpi/common');
const loginFile = path.join(dataDir, '.secrets/console-login.json');
if (!fs.existsSync(loginFile)) {
  if (!process.env.INITIAL_ADMIN_EMAIL || !process.env.INITIAL_ADMIN_PASSWORD) throw Error('Initial console credentials are required');
  fs.mkdirSync(path.dirname(loginFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(loginFile, JSON.stringify({ email: process.env.INITIAL_ADMIN_EMAIL, passwordHash: hashPassword(process.env.INITIAL_ADMIN_PASSWORD) }), { flag: 'wx', mode: 0o600 });
}
const checkoutDistDir = path.resolve(__dirname, '..', 'apps/checkout-portal/.next');

export function startCheckoutServer(port = null, options = {}) {
  const finalPort = port || Number(process.env.CHECKOUT_PORTAL_PORT || 6002);
  const bindHost = process.env.YOUPI_BIND_HOST || '127.0.0.1';

  try {
    const { NextServer } = await import('next');
    const app = NextServer({ dev: false, conf: { distDir: checkoutDistDir }, quiet: false });
    const handler = app.getRequestHandler();
    return app.prepare().then(() => {
      const server = http.createServer(handler);
      return new Promise((resolve) => {
        server.listen(finalPort, bindHost, () => {
          console.log('[Checkout Portal] Next.js server listening on port ' + finalPort);
          resolve({ port: finalPort, close: () => new Promise((cb) => server.close(cb)) });
        });
      });
    });
  } catch (err) {
    console.log('[Checkout Portal] Next.js not available, using simple server: ' + err.message);
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (pathname === '/' || pathname === '/checkout') {
          res.writeHead(200);
          res.end('<h1>24/7 Pay - Checkout</h1><p>Checkout portal is running.</p>');
        } else if (pathname.startsWith('/qr/')) {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
          res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23f0f0f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="%23666">QR Code</text></svg>');
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      server.listen(finalPort, bindHost, () => {
        console.log('[Checkout Portal] Simple server listening on port ' + finalPort);
        resolve({ port: finalPort, close: () => new Promise((cb) => server.close(cb)) });
      });
    });
  }
}

const [{ startServer }, { startAdminServer }] = await Promise.all([
  import('../apps/payment-api/src/index.js'),
  import('../apps/merchant-admin/src/index.js'),
]);
const servers = [];
const api = await startServer();
servers.push(api);
const checkout = await startCheckoutServer();
servers.push(checkout);
const admin = await startAdminServer();
servers.push(admin);
const gateway = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/_ready') {
    try { api.app.context.db.queryOne('SELECT 1 AS ok'); res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ status: 'UP', services: 3 })); }
    catch { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ status: 'DATABASE_UNAVAILABLE' })); }
    return;
  }
  if (pathname === '/store' || pathname.startsWith('/store/') || pathname.startsWith('/wallet') || pathname.startsWith('/order-')) { res.writeHead(404); res.end('Demo store is disabled.'); return; }
  if (req.method === 'POST' && (pathname === '/v1/payments' || pathname === '/v1/refunds')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
    return;
  }
  const target = pathname === '/' ? checkout.port : /^\/(checkout|pay\/|qr\/|youpi\.js|sdk\/|icons\/)/.test(pathname) ? checkout.port : /^\/(api\/platform\/|api\/v1\/|v1\.0\/|health$)/.test(pathname) ? api.port : admin.port;
  const remote = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const forwarded = process.env.RENDER === 'true' ? String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim() : remote;
  const headers = { ...req.headers, host: `127.0.0.1:${target}`, 'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': new URL(origin).protocol.slice(0, -1), 'x-gateway-token': getInternalServiceToken(), 'cf-connecting-ip': isIP(forwarded) ? forwarded : remote };
  delete headers['x-internal-token']; delete headers['x-internal-render'];
  const upstream = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Service temporarily unavailable' })); });
  res.on('close', () => upstream.destroy());
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
});
const port = Number(process.env.PORT || 8080);
await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(port, '0.0.0.0', resolve); });
console.log(`Dynamo Pay hosted gateway ready on port ${port}`);
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25000); deadline.unref();
  gateway.close(); gateway.closeIdleConnections?.();
  await Promise.allSettled(servers.reverse().map(server => server.close()));
  api.app.context.db.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
process.on('uncaughtException', error => { console.error('Hosted service error:', error.message); shutdown(); });
