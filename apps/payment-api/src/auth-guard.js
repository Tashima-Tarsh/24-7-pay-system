import { getAdminToken, safeEqual } from '@youpi/common';
import { HttpServer } from './server.js';

/** Admin-prefixed routes that are intentionally public (static APK download for pairing). */
const PUBLIC_ADMIN_PATHS = new Set([]);

/** APK download route: requires a valid bearer token (admin OR observer) plus entitlement + rate limit checked in the route handler. */
const DOWNLOAD_TOKEN_PATHS = new Set(['/api/v1/admin/sms-gateway/download-apk']);

/** SSE cannot send headers from EventSource, so these accept `?token=` on GET. */
const QUERY_TOKEN_PATHS = new Set(['/api/v1/admin/stream']);

function bearerToken(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

function isDevTool(pathname) {
  return pathname.startsWith('/api/v1/admin/dev/') || /^\/api\/v1\/checkout\/[^/]+\/simulate-observation$/.test(pathname);
}

/**
 * Decides which credential a request needs.
 * @returns {null | 'admin'} null = public, 'admin' = admin token only
 */
function requiredLevel(method, pathname) {
  // Legacy financial administration routes previously accepted ANY non-empty
  // bearer string. Production routes must be checked against ADMIN_API_TOKEN.
  if (process.env.NODE_ENV === 'production') {
    // Every legacy route that previously tested only for *presence* of a
    // bearer string must validate the actual admin credential.
    const legacyPrivileged = /^\/api\/v1\/(?:evidence|mobile-status|direct-bank|bank-reconciliation|disputes|payer-vpa|event-replay|multi-operator|circuit-breaker|acceptance-rules|attestation|receiving-accounts|provider-connections)(?:\/|$)/;
    if (legacyPrivileged.test(pathname) ||
        /^\/api\/v1\/payments\/[^/]+\/manual-verify$/.test(pathname) ||
        (pathname.startsWith('/api/v1/gmail/') && pathname !== '/api/v1/gmail/callback')) {
      return 'admin';
    }
  }
  if(/^\/api\/v1\/(collections|payouts|beneficiaries|banking|settlements|ledger|reconciliation|refunds|split-settlements|operations)(?:\/|$)/.test(pathname))return 'admin';
  if (pathname.startsWith('/api/v1/admin/')) {
    if (PUBLIC_ADMIN_PATHS.has(pathname)) return null;
    if (DOWNLOAD_TOKEN_PATHS.has(pathname)) return 'download'; // lightweight: admin token
    return 'admin';
  }
  if (method === 'POST' && pathname === '/api/v1/pollers/events') return 'admin';
  // Injects a synthetic bank message into the real verification pipeline.
  if (method === 'POST' && /^\/api\/v1\/checkout\/[^/]+\/simulate-observation$/.test(pathname)) return 'admin';
  return null;
}

/**
 * Guard for HttpServer.use(). Admin credential = ADMIN_API_TOKEN (or data/.secrets/admin_api_token).
 */
export function authGuard(req, res, pathname, url) {
  const method = req.method.toUpperCase();

  // Developer simulators push synthetic bank messages into the real pipeline and can settle live sessions.
  if (method !== 'GET' && isDevTool(pathname) && process.env.NODE_ENV === 'production' && process.env.YOUPI_ALLOW_DEV_TOOLS !== 'true') {
    HttpServer.json(res, 403, { error: 'Developer tools are disabled in production.', code: 'DEV_TOOLS_DISABLED' });
    return true;
  }

  const level = requiredLevel(method, pathname);
  if (!level) return false;

  let presented = bearerToken(req);
  if (!presented && method === 'GET' && QUERY_TOKEN_PATHS.has(pathname)) {
    presented = url.searchParams.get('token') || '';
  }

  const ok = presented && safeEqual(presented, getAdminToken());
  if (ok) return false;

  HttpServer.json(res, 401, { error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  return true;
}

/** True only when the request carries the admin token. */
export function isAdminRequest(req) {
  const presented = bearerToken(req);
  return Boolean(presented) && safeEqual(presented, getAdminToken());
}
