import { HttpServer } from '../server.js';

/**
 * Acceptance Rules — WATCH/BLOCK rules for receiving VPA / payer metadata.
 * BLOCK takes precedence. Rules control platform acceptance; they do not change bank/NPCI lists.
 */
export function registerAcceptanceRulesRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/acceptance-rules — list rules
  server.get('/api/v1/acceptance-rules', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    let sql = `SELECT id, rule_type, target_type, target_value, reason, is_active, expiry_at,
                      created_at, updated_at FROM acceptance_rules`;
    const params = [];
    if (merchantId) { sql += ` WHERE merchant_id = $1`; params.push(merchantId); }
    sql += ` ORDER BY created_at DESC`;
    const rows = db.query(sql, params);
    return HttpServer.json(res, 200, {
      rules: (rows || []).map(r => ({
        id: r.id, ruleType: r.rule_type, targetType: r.target_type, targetValue: r.target_value,
        reason: r.reason, isActive: Boolean(r.is_active), expiryAt: r.expiry_at,
        createdAt: r.created_at
      })),
      count: (rows || []).length
    });
  });

  // POST /api/v1/acceptance-rules — create rule
  server.post('/api/v1/acceptance-rules', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, ruleType, targetType, targetValue, reason, expiryAt } = body;
    if (!merchantId || !ruleType || !targetType || !targetValue) return HttpServer.json(res, 400, { error: 'merchantId, ruleType, targetType, targetValue required' });
    if (!['WATCH', 'BLOCK'].includes(ruleType)) return HttpServer.json(res, 400, { error: 'ruleType must be WATCH or BLOCK' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO acceptance_rules (id, merchant_id, rule_type, target_type, target_value,
              reason, is_active, expiry_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9)`,
      [id, merchantId, ruleType, targetType, targetValue, reason || null,
       expiryAt || null, now, now]
    );
    return HttpServer.json(res, 201, {
      ruleId: id, ruleType, targetType, targetValue, isActive: true,
      note: `Acceptance rule ${ruleType} active for ${targetType}: ${targetValue}`
    });
  });

  // PATCH /api/v1/acceptance-rules/:id — toggle active
  server.patch('/api/v1/acceptance-rules/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { isActive } = body;
    const row = db.queryOne('SELECT * FROM acceptance_rules WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Acceptance rule not found' });
    db.execute('UPDATE acceptance_rules SET is_active = $1, updated_at = $2 WHERE id = $3',
      [isActive ? 1 : 0, new Date().toISOString(), params.id]);
    return HttpServer.json(res, 200, { updated: true, ruleId: params.id, isActive: Boolean(isActive) });
  });

  // DELETE /api/v1/acceptance-rules/:id
  server.delete('/api/v1/acceptance-rules/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    db.execute('DELETE FROM acceptance_rules WHERE id = $1', [params.id]);
    return HttpServer.json(res, 200, { deleted: true, ruleId: params.id });
  });

  // GET /api/v1/acceptance-rules/evaluate — evaluate if a payment should be accepted
  server.get('/api/v1/acceptance-rules/evaluate', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const { merchantId, targetType, targetValue } = req.query || {};
    if (!merchantId || !targetType || !targetValue) return HttpServer.json(res, 400, { error: 'merchantId, targetType, targetValue required' });

    const now = new Date().toISOString();
    const rules = db.query(
      `SELECT * FROM acceptance_rules WHERE merchant_id = $1 AND target_type = $2 AND is_active = 1
       AND (expiry_at IS NULL OR expiry_at > $3) ORDER BY created_at DESC`,
      [merchantId, targetType, now]
    );

    // BLOCK takes precedence
    for (const rule of (rules || [])) {
      if (rule.rule_type === 'BLOCK' && rule.target_value === targetValue) {
        return HttpServer.json(res, 200, {
          allowed: false, ruleId: rule.id, ruleType: rule.rule_type,
          targetType: rule.target_type, targetValue: rule.target_value,
          reason: rule.reason || 'Blocked by acceptance rule',
          matchedBy: 'BLOCK'
        });
      }
    }

    // Check WATCH rules (allow but flag)
    for (const rule of (rules || [])) {
      if (rule.rule_type === 'WATCH' && rule.target_value === targetValue) {
        return HttpServer.json(res, 200, {
          allowed: true, ruleId: rule.id, ruleType: rule.rule_type,
          targetType: rule.target_type, targetValue: rule.target_value,
          reason: rule.reason || 'Watched by acceptance rule',
          matchedBy: 'WATCH'
        });
      }
    }

    return HttpServer.json(res, 200, { allowed: true, matchedBy: 'NONE', note: 'No acceptance rule applies' });
  });
}

import crypto from 'node:crypto';
