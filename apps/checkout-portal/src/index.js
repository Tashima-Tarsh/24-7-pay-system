import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', '.next');

/**
 * Checkout Portal Server for hosted gateway mode.
 * Tries Next.js production build first, falls back to a simple HTTP server
 * if .next is not built (e.g. during tests).
 */

export function startCheckoutServer(port = null, options = {}) {
  const finalPort = port || Number(process.env.CHECKOUT_PORTAL_PORT || 6002);
  const bindHost = process.env.YOUPI_BIND_HOST || '127.0.0.1';

  // Try Next.js server first
  try {
    const { NextServer } = require('next');
    const app = NextServer({
      dev: false,
      conf: { distDir },
      quiet: false,
    });
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
    // Fall back to simple HTTP server
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

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCheckoutServer();
}
