import { HttpServer } from '../server.js';

/**
 * Authenticated Payer-VPA Identity — verify and bind payer UPI identity (VPA) to payment sessions.
 */
export function registerPayerVpaRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // POST /api/v1/payer-vpa/bind — bind a payer VPA to a merchant/customer context
  server.post('/api/v1/payer-vpa/bind', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { vpa, merchantId, customerId, deviceId, signature, devicePublicKey } = body;
    if (!vpa || !merchantId) return HttpServer.json(res, 400, { error: 'vpa and merchantId required' });

    // Validate VPA format: user@handle
    const vpaRegex = /^[a-zA-Z0-9.\-]{2,64}@[a-zA-Z0-9.\-]{2,64}$/;
    if (!vpaRegex.test(vpa)) return HttpServer.json(res, 400, { error: 'Invalid VPA format' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check if binding already exists
    const existing = db.queryOne(
      `SELECT id FROM payer_vpa_bindings WHERE vpa = $1 AND merchant_id = $2`,
      [vpa, merchantId]
    );
    if (existing) {
      return HttpServer.json(res, 409, { error: 'VPA already bound to this merchant', bindingId: existing.id });
    }

    db.execute(
      `INSERT INTO payer_vpa_bindings (id, vpa, merchant_id, customer_id, device_id, signature,
              device_public_key, is_verified, verification_method, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, vpa.toLowerCase(), merchantId, customerId || null, deviceId || null,
       signature || null, devicePublicKey || null, 0, 'PENDING', now, now]
    );

    return HttpServer.json(res, 201, {
      bindingId: id, vpa: vpa.toLowerCase(), merchantId, customerId,
      isVerified: false, verificationMethod: 'PENDING', createdAt: now
    });
  });

  // GET /api/v1/payer-vpa/:vpa — get VPA binding details
  server.get('/api/v1/payer-vpa/:vpa', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const vpa = decodeURIComponent(params.vpa).toLowerCase();
    const row = db.queryOne(
      `SELECT * FROM payer_vpa_bindings WHERE vpa = $1`,
      [vpa]
    );
    if (!row) return HttpServer.json(res, 404, { error: 'VPA binding not found' });
    return HttpServer.json(res, 200, {
      bindingId: row.id, vpa: row.vpa, merchantId: row.merchant_id,
      customerId: row.customer_id, deviceId: row.device_id,
      isVerified: Boolean(row.is_verified), verificationMethod: row.verification_method,
      signature: row.signature, createdAt: row.created_at, updatedAt: row.updated_at
    });
  });

  // POST /api/v1/payer-vpa/verify — verify a payer VPA binding
  server.post('/api/v1/payer-vpa/verify', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { bindingId, verificationMethod, verifiedBy } = body;
    if (!bindingId) return HttpServer.json(res, 400, { error: 'bindingId required' });
    const now = new Date().toISOString();
    const row = db.queryOne('SELECT * FROM payer_vpa_bindings WHERE id = $1', [bindingId]);
    if (!row) return HttpServer.json(res, 404, { error: 'Binding not found' });
    db.execute(
      `UPDATE payer_vpa_bindings SET is_verified = 1, verification_method = $1, updated_at = $2 WHERE id = $3`,
      [verificationMethod || 'MANUAL_REVIEW', now, bindingId]
    );
    return HttpServer.json(res, 200, {
      bindingId, isVerified: true, verificationMethod: verificationMethod || 'MANUAL_REVIEW',
      verifiedBy: verifiedBy || 'system', verifiedAt: now
    });
  });

  // GET /api/v1/payer-vpa/merchant/:merchantId — list all VPA bindings for a merchant
  server.get('/api/v1/payer-vpa/merchant/:merchantId', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const rows = db.query(
      `SELECT * FROM payer_vpa_bindings WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [params.merchantId]
    );
    return HttpServer.json(res, 200, {
      bindings: (rows || []).map(r => ({
        bindingId: r.id, vpa: r.vpa, customerId: r.customer_id,
        deviceId: r.device_id, isVerified: Boolean(r.is_verified),
        verificationMethod: r.verification_method, createdAt: r.created_at
      })),
      count: (rows || []).length
    });
  });

  // DELETE /api/v1/payer-vpa/:bindingId — revoke a VPA binding
  server.delete('/api/v1/payer-vpa/:bindingId', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne('SELECT * FROM payer_vpa_bindings WHERE id = $1', [params.bindingId]);
    if (!row) return HttpServer.json(res, 404, { error: 'Binding not found' });
    db.execute('DELETE FROM payer_vpa_bindings WHERE id = $1', [params.bindingId]);
    return HttpServer.json(res, 200, { revoked: true, bindingId: params.bindingId });
  });
}
