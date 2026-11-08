import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PAYMENT_API_PORT = 6100;
const CHECKOUT_PORT = 7000;
const NODE_EXEC = process.execPath;

let paymentApiProc = null;
let checkoutProc = null;

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: '/health', method: 'GET', timeout: timeoutMs });
    req.on('response', () => { req.destroy(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function waitForPort(port, { maxWaitMs = 60000, label } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isPortOpen(port)) {
      console.log(`[start-servers] ${label || 'service'} ready on port ${port}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`[start-servers] ${label || 'service'} NOT ready on port ${port} after ${maxWaitMs}ms`);
  return false;
}

function startPaymentApi() {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PAYMENT_API_PORT: String(PAYMENT_API_PORT),
    SQLITE_DB_PATH: 'data/youpi_pg.sqlite',
    ENCRYPTION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    JWT_SECRET: 'e2e_test_jwt_secret_min_32_chars_long',
    INITIAL_ADMIN_EMAIL: 'admin@e2e.test',
    INITIAL_ADMIN_PASSWORD: 'e2e_test_admin_password_123',
  };
  paymentApiProc = spawn(NODE_EXEC, ['src/index.js'], {
    cwd: path.join(REPO_ROOT, 'apps', 'payment-api'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  paymentApiProc.stdout.on('data', (d) => process.stdout.write(`[payment-api] ${d}`));
  paymentApiProc.stderr.on('data', (d) => process.stderr.write(`[payment-api-err] ${d}`));
  return paymentApiProc;
}

function startCheckoutPortal() {
  const env = { ...process.env, NODE_ENV: 'test', BASE_PAYMENT_API_URL: `http://127.0.0.1:${PAYMENT_API_PORT}`, CHECKOUT_PORTAL_PORT: String(CHECKOUT_PORT) };
  checkoutProc = spawn(NODE_EXEC, ['src/index.js'], {
    cwd: path.join(REPO_ROOT, 'apps', 'checkout-portal'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  checkoutProc.stdout.on('data', (d) => process.stdout.write(`[checkout] ${d}`));
  checkoutProc.stderr.on('data', (d) => process.stderr.write(`[checkout-err] ${d}`));
  return checkoutProc;
}

function stopAll() {
  for (const p of [paymentApiProc, checkoutProc]) {
    if (p && !p.killed) {
      try { p.kill('SIGTERM'); } catch {}
    }
  }
  paymentApiProc = null;
  checkoutProc = null;
}

const action = process.argv[2];

if (action === 'start') {
  (async () => {
    stopAll();
    startPaymentApi();
    const ok1 = await waitForPort(PAYMENT_API_PORT, { label: 'Payment API' });
    if (!ok1) { process.exit(1); }
    startCheckoutPortal();
    const ok2 = await waitForPort(CHECKOUT_PORT, { label: 'Checkout Portal' });
    if (!ok2) { process.exit(1); }
    console.log('[start-servers] All services running.');
  })();
} else if (action === 'stop') {
  stopAll();
  console.log('[start-servers] All services stopped.');
} else if (action === 'status') {
  (async () => {
    const p1 = await isPortOpen(PAYMENT_API_PORT);
    const p2 = await isPortOpen(CHECKOUT_PORT);
    console.log(`Payment API (6100): ${p1 ? 'UP' : 'DOWN'}`);
    console.log(`Checkout Portal (7000): ${p2 ? 'UP' : 'DOWN'}`);
  })();
} else {
  console.log('Usage: node start-servers.js [start|stop|status]');
}
