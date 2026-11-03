import { HttpServer } from '../server.js';

/**
 * Receiving Accounts — merchant's UPI VPA that accepts direct-UPI payments.
 */
export function registerReceivingAccountRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/receiving-accounts — list active receiving accounts
  server.get('/api/v1/receiving-accounts', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });
    const rows = db.query(
      `SELECT id, upi_id, payee_name, bank_name, account_holder_name, account_number, ifsc,
              is_active, created_at, updated_at
       FROM payment_receiving_accounts WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId]
    );
    return HttpServer.json(res, 200, {
      accounts: (rows || []).map(r => ({
        id: r.id, upiId: r.upi_id, payeeName: r.payee_name, bankName: r.bank_name,
        accountHolderName: r.account_holder_name, accountNumber: r.account_number,
        ifsc: r.ifsc, isActive: Boolean(r.is_active), createdAt: r.created_at
      })),
      count: (rows || []).length
    });
  });

  // POST /api/v1/receiving-accounts — add a receiving account
  server.post('/api/v1/receiving-accounts', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, upiId, payeeName, bankName, accountHolderName, accountNumber, ifsc } = body;
    if (!merchantId || !upiId) return HttpServer.json(res, 400, { error: 'merchantId and upiId required' });

    const vpaRegex = /^[a-zA-Z0-9.\-]{2,64}@[a-zA-Z0-9.\-]{2,64}$/;
    if (!vpaRegex.test(upiId)) return HttpServer.json(res, 400, { error: 'Invalid UPI ID format' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO payment_receiving_accounts (id, merchant_id, upi_id, payee_name, bank_name,
              account_holder_name, account_number, ifsc, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10)`,
      [id, merchantId, upiId.toLowerCase(), payeeName || null, bankName || null,
       accountHolderName || null, accountNumber || null, ifsc || null, now, now]
    );

    // Auto-add UPI ID to allowedVpas in branding so payment creation validates
    try {
      const m = ctx.merchantRepo?.findById ? ctx.merchantRepo.findById(merchantId) : null;
      if (m) {
        const currentBranding = m.branding || {};
        const currentUpichannel = currentBranding.upiChannel || {enabled:true, minAmountPaise:0, maxAmountPaise:2000000, allowedVpas:[]};
        const existingVpas = [...(currentUpichannel.allowedVpas || [])];
        const normalizedVpa = upiId.trim().toLowerCase();
        if (!existingVpas.some(v => v.toLowerCase() === normalizedVpa)) {
          existingVpas.push(normalizedVpa);
        }
        ctx.merchantRepo.update(merchantId, {
          branding: {
            ...currentBranding,
            upiChannel: {
              ...currentUpichannel,
              allowedVpas: existingVpas
            }
          }
        });
      }
    } catch (brandingErr) {
      console.error('[receiving-accounts create] branding update warning:', brandingErr.message);
    }

    return HttpServer.json(res, 201, {
      accountId: id, upiId: upiId.toLowerCase(), isActive: true,
      note: 'Receiving account active — direct-UPI payments to this VPA will be accepted'
    });
  });

  // PATCH /api/v1/receiving-accounts/:id — toggle active / update
  server.patch('/api/v1/receiving-accounts/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { isActive } = body;
    const row = db.queryOne('SELECT * FROM payment_receiving_accounts WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Receiving account not found' });
    if (isActive !== undefined) {
      db.execute('UPDATE payment_receiving_accounts SET is_active = $1, updated_at = $2 WHERE id = $3',
        [isActive ? 1 : 0, new Date().toISOString(), params.id]);
    }
    return HttpServer.json(res, 200, { updated: true, accountId: params.id, isActive: isActive !== undefined ? Boolean(isActive) : null });
  });

  // DELETE /api/v1/receiving-accounts/:id
  server.delete('/api/v1/receiving-accounts/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne('SELECT * FROM payment_receiving_accounts WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Receiving account not found' });
    db.execute('DELETE FROM payment_receiving_accounts WHERE id = $1', [params.id]);
    return HttpServer.json(res, 200, { deleted: true, accountId: params.id });
  });
}

import crypto from 'node:crypto';
