import { HttpServer } from '../server.js';

/**
 * Direct Corporate Bank APIs — bank connector management for H2H bank integration.
 */
export function registerDirectBankRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/direct-bank/connectors — list bank connectors
  server.get('/api/v1/direct-bank/connectors', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    let sql = `SELECT pc.id, pc.merchant_id, pc.provider_name, pc.connection_id, pc.environment,
                      pc.is_active, pc.connection_state, pc.health_status, pc.last_health_at,
                      pc.approved, pc.enabled, pc.circuit_state, pc.failure_count,
                      pc.recovery_timeout_ms, pc.max_failures, pc.created_at, pc.updated_at
               FROM provider_connections pc`;
    const params = [];
    if (merchantId) { sql += ` WHERE pc.merchant_id = $1`; params.push(merchantId); }
    sql += ` ORDER BY pc.created_at DESC`;
    const rows = db.query(sql, params);
    return HttpServer.json(res, 200, {
      connectors: (rows || []).map(r => ({
        id: r.id, merchantId: r.merchant_id, providerName: r.provider_name,
        connectionId: r.connection_id, environment: r.environment, isActive: Boolean(r.is_active),
        connectionState: r.connection_state, healthStatus: r.health_status,
        lastHealthAt: r.last_health_at, approved: Boolean(r.approved), enabled: Boolean(r.enabled),
        circuitState: r.circuit_state || 'CLOSED', failureCount: r.failure_count || 0,
        recoveryTimeoutMs: r.recovery_timeout_ms, maxFailures: r.max_failures,
        createdAt: r.created_at, updatedAt: r.updated_at
      })),
      count: (rows || []).length
    });
  });

  // POST /api/v1/direct-bank/connectors — register a new bank connector
  server.post('/api/v1/direct-bank/connectors', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, providerName, connectionId, environment, config, approved, enabled } = body;
    if (!merchantId || !providerName || !connectionId) return HttpServer.json(res, 400, { error: 'merchantId, providerName, connectionId required' });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = db.queryOne(
      'SELECT id FROM provider_connections WHERE merchant_id = $1 AND connection_id = $2 AND provider_name = $3',
      [merchantId, connectionId, providerName]
    );
    if (existing) return HttpServer.json(res, 409, { error: 'Connector already exists' });
    db.execute(
      `INSERT INTO provider_connections (id, merchant_id, provider_name, connection_id, environment,
              config, is_active, connection_state, health_status, approved, enabled,
              circuit_state, failure_count, recovery_timeout_ms, max_failures, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'REGISTERED', 'UNKNOWN', $8, $9,
              'CLOSED', 0, $10, $11, $12, $13)`,
      [id, merchantId, providerName, connectionId, environment || 'SANDBOX',
       typeof config === 'string' ? config : JSON.stringify(config || {}),
       1, approved ? 1 : 0, enabled ? 1 : 0, 30000, 5, now, now]
    );
    return HttpServer.json(res, 201, {
      connectorId: id, merchantId, providerName, connectionId,
      environment: environment || 'SANDBOX', isActive: true, approved: Boolean(approved),
      enabled: Boolean(enabled), circuitState: 'CLOSED'
    });
  });

  // PATCH /api/v1/direct-bank/connectors/:id — update connector
  server.patch('/api/v1/direct-bank/connectors/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { isActive, connectionState, healthStatus, approved, enabled, config } = body;
    const fields = [];
    const params2 = [];
    if (isActive !== undefined) { fields.push('is_active = ?'); params2.push(isActive ? 1 : 0); }
    if (connectionState !== undefined) { fields.push('connection_state = ?'); params2.push(connectionState); }
    if (healthStatus !== undefined) { fields.push('health_status = ?'); params2.push(healthStatus); }
    if (approved !== undefined) { fields.push('approved = ?'); params2.push(approved ? 1 : 0); }
    if (enabled !== undefined) { fields.push('enabled = ?'); params2.push(enabled ? 1 : 0); }
    if (config !== undefined) { fields.push('config = ?'); params2.push(typeof config === 'string' ? config : JSON.stringify(config)); }
    if (fields.length === 0) return HttpServer.json(res, 400, { error: 'No fields to update' });
    fields.push('updated_at = ?');
    params2.push(new Date().toISOString());
    params2.push(params.id);
    const existing = db.queryOne('SELECT id FROM provider_connections WHERE id = $1', [params.id]);
    if (!existing) return HttpServer.json(res, 404, { error: 'Connector not found' });
    db.execute(`UPDATE provider_connections SET ${fields.join(', ')} WHERE id = $${params2.length}`, params2);
    return HttpServer.json(res, 200, { updated: true, connectorId: params.id });
  });

  // DELETE /api/v1/direct-bank/connectors/:id — delete connector
  server.delete('/api/v1/direct-bank/connectors/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const existing = db.queryOne('SELECT id FROM provider_connections WHERE id = $1', [params.id]);
    if (!existing) return HttpServer.json(res, 404, { error: 'Connector not found' });
    db.execute('DELETE FROM provider_connections WHERE id = $1', [params.id]);
    return HttpServer.json(res, 200, { deleted: true, connectorId: params.id });
  });

  // POST /api/v1/direct-bank/connectors/:id/health-check — run health check
  server.post('/api/v1/direct-bank/connectors/:id/health-check', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connector not found' });
    const now = new Date().toISOString();
    // Simulate health check - in production this would call the bank's health endpoint
    const isHealthy = Math.random() > 0.1; // 90% healthy for simulation
    const latencyMs = Math.floor(Math.random() * 200) + 50;
    db.execute(
      `UPDATE provider_connections SET health_status = $1, last_health_at = $2,
              connection_state = $3, updated_at = $4 WHERE id = $5`,
      [isHealthy ? 'HEALTHY' : 'UNHEALTHY', now, isHealthy ? 'ACTIVE' : 'DEGRADED', now, params.id]
    );
    db.execute(
      `INSERT INTO route_health (id, connection_id, status, latency_ms, error_message, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), params.id, isHealthy ? 'HEALTHY' : 'UNHEALTHY', latencyMs,
       isHealthy ? null : 'Health check failed', now]
    );
    return HttpServer.json(res, 200, {
      connectorId: params.id, healthy: isHealthy, latencyMs, checkedAt: now
    });
  });

  // GET /api/v1/direct-bank/capabilities — list provider capabilities
  server.get('/api/v1/direct-bank/capabilities', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const rows = db.query('SELECT * FROM provider_capabilities ORDER BY provider_name, capability');
    return HttpServer.json(res, 200, {
      capabilities: (rows || []).map(r => ({
        id: r.id, providerName: r.provider_name, capability: r.capability,
        supported: Boolean(r.supported), version: r.version, notes: r.notes
      })),
      count: (rows || []).length
    });
  });
}

import crypto from 'node:crypto';
