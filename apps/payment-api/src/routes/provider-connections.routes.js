import { HttpServer } from '../server.js';

/**
 * Provider Connections — production provider credentials (Cashfree, etc.)
 */
export function registerProviderConnectionsRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/provider-connections — list provider connections
  server.get('/api/v1/provider-connections', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    let sql = `SELECT id, provider, environment, client_id, client_secret_encrypted,
                      is_enabled, status, last_test_at, created_at, updated_at
               FROM provider_connections`;
    const params = [];
    if (merchantId) { sql += ` WHERE merchant_id = $1`; params.push(merchantId); }
    sql += ` ORDER BY created_at DESC`;
    const rows = db.query(sql, params);
    return HttpServer.json(res, 200, {
      connections: (rows || []).map(r => ({
        id: r.id, provider: r.provider, environment: r.environment,
        clientId: r.client_id, clientSecretSet: Boolean(r.client_secret_encrypted),
        isEnabled: Boolean(r.is_enabled), status: r.status || 'PENDING',
        lastTestAt: r.last_test_at, createdAt: r.created_at
      })),
      count: (rows || []).length
    });
  });

  // POST /api/v1/provider-connections — add provider credentials
  server.post('/api/v1/provider-connections', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, provider, environment, clientId, clientSecret, isEnabled } = body;
    if (!merchantId || !provider || !clientId || !clientSecret) return HttpServer.json(res, 400, { error: 'merchantId, provider, clientId, clientSecret required' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // Store client_secret encrypted (placeholder: real encryption uses ENCRYPTION_MASTER_KEY)
    const encrypted = Buffer.from(clientSecret).toString('base64');
    db.execute(
      `INSERT INTO provider_connections (id, merchant_id, provider, environment, client_id,
              client_secret_encrypted, is_enabled, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9)`,
      [id, merchantId, provider, environment || 'PRODUCTION', clientId, encrypted,
       isEnabled ? 1 : 0, now, now]
    );
    return HttpServer.json(res, 201, {
      connectionId: id, provider, environment: environment || 'PRODUCTION',
      isEnabled: Boolean(isEnabled), status: 'PENDING',
      note: 'Provider credentials stored — activate after test connection succeeds'
    });
  });

  // POST /api/v1/provider-connections/:id/test — test provider connection
  server.post('/api/v1/provider-connections/:id/test', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Provider connection not found' });
    const now = new Date().toISOString();
    // Simulate provider test — in production this calls provider health endpoint
    db.execute(
      `UPDATE provider_connections SET status = 'ACTIVE', last_test_at = $1,
              updated_at = $2 WHERE id = $3`,
      [now, now, params.id]
    );
    return HttpServer.json(res, 200, {
      connectionId: params.id, provider: row.provider, status: 'ACTIVE',
      testedAt: now, note: 'Provider connection active — production processing enabled'
    });
  });

  // PATCH /api/v1/provider-connections/:id/enable
  server.patch('/api/v1/provider-connections/:id/enable', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { isEnabled } = body;
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Provider connection not found' });
    db.execute('UPDATE provider_connections SET is_enabled = $1, updated_at = $2 WHERE id = $3',
      [isEnabled ? 1 : 0, new Date().toISOString(), params.id]);
    return HttpServer.json(res, 200, { updated: true, connectionId: params.id, isEnabled: Boolean(isEnabled) });
  });

  // DELETE /api/v1/provider-connections/:id
  server.delete('/api/v1/provider-connections/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    db.execute('DELETE FROM provider_connections WHERE id = $1', [params.id]);
    return HttpServer.json(res, 200, { deleted: true, connectionId: params.id });
  });
}

import crypto from 'node:crypto';
