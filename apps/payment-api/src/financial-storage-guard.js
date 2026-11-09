import { HttpServer } from './server.js';

/**
 * Payment creation must not depend on the ephemeral filesystem of a hosted
 * container. SQLite remains supported for local development and isolated tests.
 * Read-only routes and administrative setup stay available to allow migration.
 */
export function durableFinancialStorageAvailable(db, environment = process.env.NODE_ENV) {
  return environment !== 'production' || db?.dialect === 'postgres';
}

const financialPrefixes = [
  /^\/api\/v1\/(?:payments|payment-links|collections|payouts|settlements|refunds|split-settlements|beneficiaries)(?:\/|$)/,
  /^\/v1\/(?:payments|refunds)(?:\/|$)/,
  /^\/api\/platform\/v1\/(?:payments|refunds|payouts)(?:\/|$)/
];

export function rejectEphemeralFinancialWrite(req, res, pathname, db, environment = process.env.NODE_ENV) {
  if (durableFinancialStorageAvailable(db, environment)) return false;
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return false;
  if (pathname === '/api/v1/orders') return false; // authenticated inside order-create route
  if (!financialPrefixes.some(regex => regex.test(pathname))) return false;
  HttpServer.json(res, 503, {
    error: 'Financial operations are unavailable until durable PostgreSQL storage is configured.',
    code: 'DURABLE_STORAGE_REQUIRED',
    retryable: true
  });
  return true;
}
