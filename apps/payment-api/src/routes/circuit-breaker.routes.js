import { HttpServer } from '../server.js';

/**
 * Provider Circuit-Breaker Control Plane — manage circuit breaker state per provider connection.
 */
export function registerCircuitBreakerRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/circuit-breaker — list all circuit breaker states
  server.get('/api/v1/circuit-breaker', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const rows = db.query(
      `SELECT pc.id, pc.merchant_id, pc.provider_name, pc.connection_id,
              pc.circuit_state, pc.failure_count, pc.last_failure_at,
              pc.opened_at, pc.half_open_at, pc.recovery_timeout_ms,
              pc.max_failures, pc.updated_at
       FROM provider_connections pc
       ORDER BY pc.created_at DESC`
    );
    return HttpServer.json(res, 200, { breakers: (rows || []).map(r => ({
      id: r.id, merchantId: r.merchant_id, providerName: r.provider_name,
      connectionId: r.connection_id, circuitState: r.circuit_state || 'CLOSED',
      failureCount: r.failure_count || 0, lastFailureAt: r.last_failure_at,
      openedAt: r.opened_at, halfOpenAt: r.half_open_at,
      recoveryTimeoutMs: r.recovery_timeout_ms || 30000, maxFailures: r.max_failures || 5,
      updatedAt: r.updated_at
    })), count: (rows || []).length });
  });

  // GET /api/v1/circuit-breaker/:id — get single breaker state
  server.get('/api/v1/circuit-breaker/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connection not found' });
    return HttpServer.json(res, 200, {
      id: row.id, merchantId: row.merchant_id, providerName: row.provider_name,
      circuitState: row.circuit_state || 'CLOSED', failureCount: row.failure_count || 0,
      lastFailureAt: row.last_failure_at, openedAt: row.opened_at,
      halfOpenAt: row.half_open_at, recoveryTimeoutMs: row.recovery_timeout_ms || 30000,
      maxFailures: row.max_failures || 5, updatedAt: row.updated_at
    });
  });

  // POST /api/v1/circuit-breaker/:id/trip — manually trip (open) a circuit breaker
  server.post('/api/v1/circuit-breaker/:id/trip', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { reason, recoveryTimeoutMs } = body;
    const now = new Date().toISOString();
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connection not found' });
    db.execute(
      `UPDATE provider_connections SET circuit_state = 'OPEN', opened_at = $1, failure_count = COALESCE(failure_count,0) + 1,
              last_failure_at = $2, recovery_timeout_ms = $3, updated_at = $4 WHERE id = $5`,
      [now, now, recoveryTimeoutMs || 30000, now, params.id]
    );
    // Record route health event
    db.execute(
      `INSERT INTO route_health (id, connection_id, status, latency_ms, error_message, checked_at)
       VALUES ($1, $2, 'UNHEALTHY', NULL, $3, $4)`,
      [crypto.randomUUID(), params.id, reason || 'Manually tripped', now]
    );
    return HttpServer.json(res, 200, { tripped: true, connectionId: params.id, circuitState: 'OPEN' });
  });

  // POST /api/v1/circuit-breaker/:id/reset — manually reset (close) a circuit breaker
  server.post('/api/v1/circuit-breaker/:id/reset', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const now = new Date().toISOString();
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connection not found' });
    db.execute(
      `UPDATE provider_connections SET circuit_state = 'CLOSED', failure_count = 0,
              opened_at = NULL, half_open_at = NULL, updated_at = $1 WHERE id = $2`,
      [now, params.id]
    );
    return HttpServer.json(res, 200, { reset: true, connectionId: params.id, circuitState: 'CLOSED' });
  });

  // POST /api/v1/circuit-breaker/:id/half-open — set to half-open for testing
  server.post('/api/v1/circuit-breaker/:id/half-open', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const now = new Date().toISOString();
    const row = db.queryOne('SELECT * FROM provider_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connection not found' });
    db.execute(
      `UPDATE provider_connections SET circuit_state = 'HALF_OPEN', half_open_at = $1, updated_at = $2 WHERE id = $3`,
      [now, now, params.id]
    );
    return HttpServer.json(res, 200, { halfOpen: true, connectionId: params.id, circuitState: 'HALF_OPEN' });
  });

  // GET /api/v1/circuit-breaker/health — route health summary
  server.get('/api/v1/circuit-breaker/health', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const rows = db.query(
      `SELECT rh.connection_id, rh.status, rh.latency_ms, rh.error_message, rh.checked_at,
              pc.provider_name, pc.circuit_state
       FROM route_health rh
       JOIN provider_connections pc ON pc.id = rh.connection_id
       ORDER BY rh.checked_at DESC LIMIT 50`
    );
    return HttpServer.json(res, 200, { health: (rows || []).map(r => ({
      connectionId: r.connection_id, providerName: r.provider_name,
      circuitState: r.circuit_state, status: r.status, latencyMs: r.latency_ms,
      errorMessage: r.error_message, checkedAt: r.checked_at
    })), count: (rows || []).length });
  });
}

import crypto from 'node:crypto';
