import { HttpServer } from '../server.js';

/**
 * Distributed Event Replay — replay durable outbox events for recovery after failures.
 */
export function registerEventReplayRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/event-replay/pending — list pending/delivered events eligible for replay
  server.get('/api/v1/event-replay/pending', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    let rows;
    if (merchantId) {
      rows = db.query(
        `SELECT * FROM callback_outbox WHERE merchant_id = $1 AND status IN ('PENDING','DEAD_LETTER') ORDER BY created_at DESC LIMIT 100`,
        [merchantId]
      );
    } else {
      rows = db.query(
        `SELECT * FROM callback_outbox WHERE status IN ('PENDING','DEAD_LETTER') ORDER BY created_at DESC LIMIT 100`
      );
    }
    return HttpServer.json(res, 200, { events: (rows || []).map(r => ({
      id: r.id, merchantId: r.merchant_id, paymentId: r.payment_id,
      eventType: r.event_type, status: r.status, attempts: r.attempts,
      maxAttempts: r.max_attempts, nextRetryAt: r.next_retry_at,
      lastError: r.last_error, createdAt: r.created_at
    })), count: (rows || []).length });
  });

  // POST /api/v1/event-replay/:id — replay a single event
  server.post('/api/v1/event-replay/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne('SELECT * FROM callback_outbox WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Event not found' });
    if (row.status === 'DELIVERED') return HttpServer.json(res, 400, { error: 'Already delivered' });

    // Reset attempt counter and schedule immediate retry
    db.execute(
      `UPDATE callback_outbox SET status = 'PENDING', attempts = 0, next_retry_at = $1, last_error = NULL, updated_at = $2 WHERE id = $3`,
      [new Date().toISOString(), new Date().toISOString(), params.id]
    );
    return HttpServer.json(res, 200, { replayed: true, eventId: params.id, status: 'PENDING' });
  });

  // POST /api/v1/event-replay/bulk — bulk replay events by status
  server.post('/api/v1/event-replay/bulk', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { status, merchantId } = body;
    const now = new Date().toISOString();
    if (merchantId) {
      db.execute(
        `UPDATE callback_outbox SET status = 'PENDING', attempts = 0, next_retry_at = $1, last_error = NULL, updated_at = $2 WHERE merchant_id = $3 AND status = $4`,
        [now, now, merchantId, status || 'DEAD_LETTER']
      );
    } else {
      db.execute(
        `UPDATE callback_outbox SET status = 'PENDING', attempts = 0, next_retry_at = $1, last_error = NULL, updated_at = $2 WHERE status = $3`,
        [now, now, status || 'DEAD_LETTER']
      );
    }
    return HttpServer.json(res, 200, { bulkReplayed: true, status: status || 'DEAD_LETTER', merchantId });
  });

  // GET /api/v1/event-replay/history — replay history
  server.get('/api/v1/event-replay/history', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const rows = db.query(
      `SELECT cda.outbox_id, cda.attempt_number, cda.status_code, cda.latency_ms, cda.error_message, cda.created_at,
              co.event_type, co.merchant_id
       FROM callback_delivery_attempts cda
       JOIN callback_outbox co ON co.id = cda.outbox_id
       ORDER BY cda.created_at DESC LIMIT 100`
    );
    return HttpServer.json(res, 200, { history: (rows || []).map(r => ({
      outboxId: r.outbox_id, eventType: r.event_type, merchantId: r.merchant_id,
      attemptNumber: r.attempt_number, statusCode: r.status_code,
      latencyMs: r.latency_ms, errorMessage: r.error_message, createdAt: r.created_at
    })), count: (rows || []).length });
  });
}
