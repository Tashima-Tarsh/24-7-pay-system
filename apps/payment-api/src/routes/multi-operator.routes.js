import { HttpServer } from '../server.js';

/**
 * Multi-Operator Role System — manage merchant users, roles, and permissions with multi-operator support.
 */
export function registerMultiOperatorRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/multi-operator/users — list merchant users
  server.get('/api/v1/multi-operator/users', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });
    const rows = db.query(
      `SELECT mu.id, mu.merchant_id, mu.user_id, mu.email, mu.role_id, mu.status,
              mu.invited_by, mu.invited_at, mu.accepted_at, mu.last_login_at,
              r.name AS role_name, r.scope AS role_scope
       FROM merchant_users mu
       LEFT JOIN roles r ON r.id = mu.role_id
       WHERE mu.merchant_id = $1
       ORDER BY mu.created_at DESC`,
      [merchantId]
    );
    return HttpServer.json(res, 200, {
      users: (rows || []).map(r => ({
        id: r.id, merchantId: r.merchant_id, userId: r.user_id, email: r.email,
        roleId: r.role_id, roleName: r.role_name, roleScope: r.role_scope,
        status: r.status, invitedBy: r.invited_by, invitedAt: r.invited_at,
        acceptedAt: r.accepted_at, lastLoginAt: r.last_login_at
      })),
      count: (rows || []).length
    });
  });

  // POST /api/v1/multi-operator/users — invite a new operator
  server.post('/api/v1/multi-operator/users', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, email, roleId, invitedBy } = body;
    if (!merchantId || !email || !roleId) return HttpServer.json(res, 400, { error: 'merchantId, email, roleId required' });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = db.queryOne('SELECT id FROM merchant_users WHERE merchant_id = $1 AND email = $2', [merchantId, email]);
    if (existing) return HttpServer.json(res, 409, { error: 'User already invited for this merchant' });
    db.execute(
      `INSERT INTO merchant_users (id, merchant_id, user_id, email, role_id, status, invited_by, invited_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9)`,
      [id, merchantId, id, email, roleId, invitedBy || 'system', now, now, now]
    );
    return HttpServer.json(res, 201, {
      userId: id, merchantId, email, roleId, status: 'PENDING', invitedAt: now
    });
  });

  // PATCH /api/v1/multi-operator/users/:id — update user role/status
  server.patch('/api/v1/multi-operator/users/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { roleId, status } = body;
    const fields = [];
    const params2 = [];
    if (roleId !== undefined) { fields.push('role_id = ?'); params2.push(roleId); }
    if (status !== undefined) { fields.push('status = ?'); params2.push(status); }
    if (fields.length === 0) return HttpServer.json(res, 400, { error: 'No fields to update' });
    fields.push('updated_at = ?');
    params2.push(new Date().toISOString());
    params2.push(params.id);
    const existing = db.queryOne('SELECT id FROM merchant_users WHERE id = $1', [params.id]);
    if (!existing) return HttpServer.json(res, 404, { error: 'User not found' });
    db.execute(`UPDATE merchant_users SET ${fields.join(', ')} WHERE id = $${params2.length}`, params2);
    return HttpServer.json(res, 200, { updated: true, userId: params.id });
  });

  // DELETE /api/v1/multi-operator/users/:id — remove operator
  server.delete('/api/v1/multi-operator/users/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const existing = db.queryOne('SELECT id FROM merchant_users WHERE id = $1', [params.id]);
    if (!existing) return HttpServer.json(res, 404, { error: 'User not found' });
    db.execute('DELETE FROM merchant_users WHERE id = $1', [params.id]);
    return HttpServer.json(res, 200, { removed: true, userId: params.id });
  });

  // GET /api/v1/multi-operator/roles — list available roles
  server.get('/api/v1/multi-operator/roles', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    let sql = 'SELECT id, name, scope, description, is_system FROM roles';
    const params2 = [];
    if (merchantId) {
      sql += ' WHERE scope = $1 OR scope = \'platform\'';
      params2.push('merchant');
    }
    sql += ' ORDER BY name';
    const rows = db.query(sql, params2);
    return HttpServer.json(res, 200, {
      roles: (rows || []).map(r => ({
        id: r.id, name: r.name, scope: r.scope, description: r.description, isSystem: Boolean(r.is_system)
      })),
      count: (rows || []).length
    });
  });

  // POST /api/v1/multi-operator/roles — create custom role
  server.post('/api/v1/multi-operator/roles', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { name, scope, description } = body;
    if (!name || !scope) return HttpServer.json(res, 400, { error: 'name and scope required' });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO roles (id, name, scope, description, is_system, created_at) VALUES ($1, $2, $3, $4, 0, $5)`,
      [id, name, scope, description || null, now]
    );
    return HttpServer.json(res, 201, { roleId: id, name, scope, description, isSystem: false });
  });

  // GET /api/v1/multi-operator/permissions — list permissions
  server.get('/api/v1/multi-operator/permissions', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const rows = db.query('SELECT id, code, name, description, module FROM permissions ORDER BY module, code');
    return HttpServer.json(res, 200, {
      permissions: (rows || []).map(r => ({
        id: r.id, code: r.code, name: r.name, description: r.description, module: r.module
      })),
      count: (rows || []).length
    });
  });
}

import crypto from 'node:crypto';
