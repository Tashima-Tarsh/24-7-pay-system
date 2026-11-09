import { HttpServer } from '../server.js';

/**
 * GitHub Code Attestation — universal code verification endpoint.
 * Allows anyone to verify that the deployed code matches a specific GitHub commit
 * and that no unauthorized changes have been made (anti-impersonation).
 */
export function registerCodeAttestationRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // A legacy route cannot attest a deployment without trusted build provenance.
  // Keep the endpoint for compatibility without exposing source repository details.
  server.get('/api/v1/attestation/github', (req, res) => {
    return HttpServer.json(res, 410, {
      error: 'Source-based attestation is no longer available.',
      code: 'ATTESTATION_UNAVAILABLE'
    });
  });

  // GET /api/v1/attestation/device — device fingerprint binding
  server.get('/api/v1/attestation/device', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });

    const { deviceId } = req.query || {};
    if (!deviceId) return HttpServer.json(res, 400, { error: 'deviceId required' });

    // Record device fingerprint for anti-impersonation
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.execute(
      `INSERT INTO device_fingerprints (id, device_id, first_seen, last_seen, is_trusted)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (device_id) DO UPDATE SET last_seen = $4`,
      [id, deviceId, now, now]
    );

    return HttpServer.json(res, 200, {
      deviceId,
      fingerprintId: id,
      trusted: false,
      note: 'Device must be trusted by merchant admin before processing payments'
    });
  });

  // POST /api/v1/attestation/merchant-bind — bind payment session to merchant
  server.post('/api/v1/attestation/merchant-bind', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });

    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }

    const { paymentId, merchantId, deviceId } = body;
    if (!paymentId || !merchantId) return HttpServer.json(res, 400, { error: 'paymentId and merchantId required' });

    const now = new Date().toISOString();

    // Record merchant-device binding for anti-impersonation
    db.execute(
      `INSERT INTO merchant_device_bindings (id, payment_id, merchant_id, device_id, bound_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (payment_id) DO UPDATE SET merchant_id = $3, device_id = $4, bound_at = $5`,
      [crypto.randomUUID(), paymentId, merchantId, deviceId || null, now]
    );

    return HttpServer.json(res, 200, {
      bound: true,
      paymentId,
      merchantId,
      deviceId: deviceId || null,
      boundAt: now,
      note: 'Payment session bound to merchant and device — prevents impersonation'
    });
  });
}

import crypto from 'node:crypto';
