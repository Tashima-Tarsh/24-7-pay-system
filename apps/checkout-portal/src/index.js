import http from 'node:http';
import { NextServer } from 'next';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Checkout Portal Server for hosted gateway mode.
 * Serves the Next.js production build from .next/ directory.
 */

export function startCheckoutServer(port = null, options = {}) {
  const finalPort = port || Number(process.env.CHECKOUT_PORTAL_PORT || 6002);
  const bindHost = process.env.YOUPI_BIND_HOST || '127.0.0.1';
  const distDir = path.resolve(__dirname, '..', '.next');

  const app = NextServer({
    dev: false,
    conf: {
      distDir,
    },
    quiet: false,
  });

  const handler = app.getRequestHandler();

  return app.prepare().then(() => {
    const server = http.createServer(handler);

    return new Promise((resolve) => {
      server.listen(finalPort, bindHost, () => {
        console.log(`[Checkout Portal] Server listening on port ${finalPort}`);
        resolve({
          port: finalPort,
          close: () => new Promise((cb) => server.close(cb)),
        });
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCheckoutServer();
}
