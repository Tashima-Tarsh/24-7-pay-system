import { HttpServer } from '../server.js';
import { ReconciliationRepository } from '@youpi/db';

/**
 * Automatic Bank-Statement Reconciliation — reconcile internal ledger against bank statements.
 */
export function registerBankReconciliationRoutes(server, ctx) {
  const db = ctx.db;
  const reconRepo = new ReconciliationRepository(db);

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // POST /api/v1/bank-reconciliation/run — run reconciliation for a period
  server.post('/api/v1/bank-reconciliation/run', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, providerName, periodStart, periodEnd } = body;
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });

    // Count payment orders in period
    let sql = `SELECT COUNT(*) AS n FROM payment_orders WHERE merchant_id = $1`;
    const params = [merchantId];
    if (periodStart) { sql += ` AND created_at >= $2`; params.push(periodStart); }
    if (periodEnd) { sql += ` AND created_at <= $3`; params.push(periodEnd); }
    const totalOrders = Number(db.queryOne(sql, params)?.n || 0);

    // Count matched (successful with provider reference)
    let matchSql = `SELECT COUNT(*) AS n FROM payment_orders WHERE merchant_id = $1 AND status = 'SUCCESS' AND provider_payment_id IS NOT NULL`;
    const matchParams = [merchantId];
    let mpIdx = 2;
    if (periodStart) { matchSql += ` AND created_at >= $${mpIdx++}`; matchParams.push(periodStart); }
    if (periodEnd) { matchSql += ` AND created_at <= $${mpIdx++}`; matchParams.push(periodEnd); }
    const totalMatched = Number(db.queryOne(matchSql, matchParams)?.n || 0);
    const totalDiscrepancies = totalOrders - totalMatched;

    const run = reconRepo.createRun({
      merchantId, providerName: providerName || 'UPI_COLLECTION',
      periodStart: periodStart || null, periodEnd: periodEnd || null,
      totalOrdersChecked: totalOrders, totalMatched, totalDiscrepancies,
      status: 'COMPLETED',
      details: { reconciledAt: new Date().toISOString(), source: 'AUTOMATIC' }
    });

    // Record exceptions for unmatched orders
    const unmatchedSql = `SELECT id, order_id, amount_paise, status, provider_payment_id FROM payment_orders WHERE merchant_id = $1 AND (status <> 'SUCCESS' OR provider_payment_id IS NULL)`;
    const unmatchedParams = [merchantId];
    let uIdx = 2;
    if (periodStart) { unmatchedSql += ` AND created_at >= $${uIdx++}`; unmatchedParams.push(periodStart); }
    if (periodEnd) { unmatchedSql += ` AND created_at <= $${uIdx++}`; unmatchedParams.push(periodEnd); }
    const unmatched = db.query(unmatchedSql, unmatchedParams) || [];
    for (const order of unmatched) {
      reconRepo.recordException({
        runId: run.id, merchantId, paymentOrderId: order.id,
        providerOrderId: order.provider_payment_id || null,
        exceptionType: order.status !== 'SUCCESS' ? 'PAYMENT_NOT_SUCCESS' : 'MISSING_PROVIDER_REFERENCE',
        expectedValue: order.amount_paise ? String(order.amount_paise) : null,
        actualValue: null,
        status: 'OPEN'
      });
    }

    return HttpServer.json(res, 200, {
      runId: run.id, merchantId, providerName: run.provider_name,
      periodStart: run.period_start, periodEnd: run.period_end,
      totalOrdersChecked: run.total_orders_checked, totalMatched: run.total_matched,
      totalDiscrepancies: run.total_discrepancies, status: run.status,
      exceptionsRecorded: unmatched.length
    });
  });

  // GET /api/v1/bank-reconciliation/exceptions — list reconciliation exceptions
  server.get('/api/v1/bank-reconciliation/exceptions', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    const status = req.query && req.query.status ? String(req.query.status) : null;
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });
    const exceptions = reconRepo.listExceptions(merchantId, status || null);
    return HttpServer.json(res, 200, {
      exceptions: (exceptions || []).map(e => ({
        id: e.id, runId: e.run_id, paymentOrderId: e.payment_order_id,
        providerOrderId: e.provider_order_id, exceptionType: e.exception_type,
        expectedValue: e.expected_value, actualValue: e.actual_value,
        status: e.status, resolutionNotes: e.resolution_notes,
        createdAt: e.created_at
      })),
      count: (exceptions || []).length
    });
  });

  // POST /api/v1/bank-reconciliation/exceptions/:id/resolve — resolve exception
  server.post('/api/v1/bank-reconciliation/exceptions/:id/resolve', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { resolutionNotes } = body;
    if (!resolutionNotes) return HttpServer.json(res, 400, { error: 'resolutionNotes required' });
    const resolved = reconRepo.resolveException(params.id, resolutionNotes);
    if (!resolved) return HttpServer.json(res, 404, { error: 'Exception not found' });
    return HttpServer.json(res, 200, { resolved: true, exceptionId: params.id });
  });

  // GET /api/v1/bank-reconciliation/runs — list reconciliation runs
  server.get('/api/v1/bank-reconciliation/runs', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const merchantId = req.query && req.query.merchantId ? String(req.query.merchantId) : null;
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });
    const runs = reconRepo.listRuns(merchantId);
    return HttpServer.json(res, 200, {
      runs: (runs || []).map(r => ({
        id: r.id, providerName: r.provider_name, periodStart: r.period_start,
        periodEnd: r.period_end, totalOrdersChecked: r.total_orders_checked,
        totalMatched: r.total_matched, totalDiscrepancies: r.total_discrepancies,
        status: r.status, createdAt: r.created_at
      })),
      count: (runs || []).length
    });
  });
}
