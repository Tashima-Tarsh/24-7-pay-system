import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal checkout portal server for hosted gateway mode.
 *
 * Serves customer-facing checkout routes:
 *   /checkout        - checkout page
 *   /pay/            - payment processing
 *   /qr/             - QR code generation
 *   /youpi.js        - checkout SDK script
 *   /sdk/            - SDK assets
 *   /icons/          - UPI provider icons
 */

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size });
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

function htmlResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>24/7 Pay</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`,
  };
}

export function startCheckoutServer(port = null, options = {}) {
  const finalPort = port || Number(process.env.CHECKOUT_PORTAL_PORT || 6002);
  const bindHost = process.env.YOUPI_BIND_HOST || '127.0.0.1';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health endpoint for the checkout service itself
    if (pathname === '/_checkout/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP', service: 'checkout-portal' }));
      return;
    }

    // Checkout page
    if (pathname === '/checkout' || pathname === '/checkout/') {
      const orderId = url.searchParams.get('order') || 'unknown';
      const amount = url.searchParams.get('amount') || '0.00';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>24/7 Pay</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
        <h1>24/7 Pay - Checkout</h1>
        <p>Order: <strong>${orderId}</strong></p>
        <p>Amount: <strong>${amount}</strong></p>
        <p>Scan the QR code with your UPI app to pay.</p>
        <img src="/qr/?order=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(amount)}" alt="UPI QR" />
      </body></html>`);
      return;
    }

    // Payment processing
    if (pathname.startsWith('/pay/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment</title></head><body><h1>Payment Processing</h1><p>Processing payment at ${pathname}</p></body></html>`);
      return;
    }

    // QR code generation
    if (pathname.startsWith('/qr/')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23f0f0f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="%23666">QR Code</text></svg>`);
      return;
    }

    // SDK script
    if (pathname === '/youpi.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(`
        // 24/7 Pay Checkout SDK
        window.YoupiPay = {
          version: '1.0.0',
          createPayment: async () => { console.log('YoupiPay.createPayment called'); },
        };
      `);
      return;
    }

    // SDK assets
    if (pathname.startsWith('/sdk/')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('// YoupiPay SDK asset');
      return;
    }

    // Icons
    if (pathname.startsWith('/icons/')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="%2300a400"/></svg>`);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return new Promise((resolve) => {
    const instance = server.listen(finalPort, bindHost, () => {
      console.log(`[Checkout Portal] Server listening on port ${finalPort}`);
      resolve({
        port: finalPort,
        close: () => new Promise((cb) => instance.close(cb)),
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCheckoutServer();
}
