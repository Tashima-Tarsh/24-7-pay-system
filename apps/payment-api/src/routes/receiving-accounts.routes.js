import { HttpServer } from '../server.js';

/**
 * Receiving Accounts — merchant's UPI VPA that accepts direct-UPI payments.
 */
export function registerReceivingAccountRoutes(server, ctx) {
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
    const rows = ctx.accountRepo.findByMerchantId(merchantId);
    return HttpServer.json(res, 200, {
      accounts: (rows || []).map(a => ({
        id: a.id, upiId: a.upiId, payeeName: a.payeeName,
        bankName: a.bankDetails?.bankName || null,
        accountHolderName: a.bankDetails?.accountHolderName || null,
        accountNumber: a.bankDetails?.accountNumberMasked || null,
        ifsc: a.bankDetails?.ifsc || null,
        isActive: a.isActive, createdAt: a.createdAt
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

    let account;
    try {
      account = ctx.accountRepo.create({
        merchantId,
        upiId,
        payeeName: payeeName || ctx.merchantRepo?.findById?.(merchantId)?.businessName || 'Merchant',
        bankName: bankName || undefined,
        accountHolderName: accountHolderName || undefined,
        accountNumber: accountNumber || undefined,
        ifsc: ifsc || undefined,
        isActive: true
      });
    } catch (err) {
      return HttpServer.json(res, 400, { error: err.message || 'Could not create receiving account' });
    }

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
      accountId: account.id, upiId: account.upiId, isActive: account.isActive,
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
    const account = ctx.accountRepo.findById(params.id);
    if (!account) return HttpServer.json(res, 404, { error: 'Receiving account not found' });
    if (isActive !== undefined) {
      if (isActive) ctx.accountRepo.activateAccount(account.merchantId, account.id);
      else ctx.accountRepo.deactivateAccount(account.merchantId, account.id);
    }
    const updated = ctx.accountRepo.findById(params.id);
    return HttpServer.json(res, 200, { updated: true, accountId: params.id, isActive: updated ? updated.isActive : null });
  });

  // DELETE /api/v1/receiving-accounts/:id
  server.delete('/api/v1/receiving-accounts/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const account = ctx.accountRepo.findById(params.id);
    if (!account) return HttpServer.json(res, 404, { error: 'Receiving account not found' });
    try {
      ctx.accountRepo.deleteAccount(account.merchantId, account.id);
    } catch (err) {
      return HttpServer.json(res, 400, { error: err.message });
    }
    return HttpServer.json(res, 200, { deleted: true, accountId: params.id });
  });
}
