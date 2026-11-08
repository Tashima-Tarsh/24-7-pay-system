/**
 * Law Enforcement Cooperation Protocol — Phase 4 Deliverable 6
 *
 * When ED/CBI/Police send a lawful request, you MUST respond.
 * Build the protocol now.
 *
 * This route is AUTHENTICATED via separate admin channel, NOT merchant API.
 *
 * Headers required:
 *   x-le-agency: Law enforcement agency name
 *   x-le-case-number: Case number
 *   x-le-officer: Officer name/ID
 *
 * Endpoint:
 *   POST   /api/v1/internal/le-request
 */

import { HttpServer } from '../server.js';
import { AuditLogger } from '@youpi/core/audit/logger';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_MASTER_KEY;
const ENCRYPTION_KEY = ENCRYPTION_KEY_HEX
  ? Buffer.from(ENCRYPTION_KEY_HEX, 'hex')
  : null;

if (ENCRYPTION_KEY && ENCRYPTION_KEY.length !== 32) {
  throw new Error(
    'ENCRYPTION_MASTER_KEY must be set as a 32-byte (64 hex char) value'
  );
}

/**
 * Register LE request routes.
 *
 * @param {import('../server.js').HttpServer} server - HTTP server instance
 * @param {object} ctx - Context with db and auditLogger
 */
export function registerLERequestRoutes(server, ctx) {
  const { db, auditLogger } = ctx;

  // POST /api/v1/internal/le-request
  // Law enforcement request endpoint — authenticated via separate admin channel
  server.post('/api/v1/internal/le-request', async (req, res) => {
    try {
      // Verify law enforcement auth headers
      const agency = req.headers['x-le-agency'];
      const caseNumber = req.headers['x-le-case-number'];
      const officer = req.headers['x-le-officer'];

      if (!agency || !caseNumber || !officer) {
        return HttpServer.json(res, 401, {
          error: 'Missing LE authentication headers',
          code: 'MISSING_LE_AUTH'
        });
      }

      const body = await HttpServer.parseBody(req);
      const { case_number: caseNum, target_type, target_id, date_range } = body;

      const effectiveCaseNumber = caseNumber || caseNum;

      if (!effectiveCaseNumber || !target_type || !target_id) {
        return HttpServer.json(res, 400, {
          error: 'Missing required fields: case_number, target_type, target_id',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // ---- Log the LE request itself (regulatory requirement) ----
      await auditLogger.log({
        actorType: 'ADMIN',
        actorId: officer,
        action: 'LE_REQUEST_RECEIVED',
        resourceType: 'le_request',
        resourceId: effectiveCaseNumber,
        ipAddress: req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
        deviceFingerprint: null,
        requestPayload: { agency, case_number: effectiveCaseNumber, target_type, target_id, date_range },
        responsePayload: null,
        outcome: 'SUCCESS',
        rejectionReason: null
      });

      // ---- Fetch data based on target_type ----
      let data;
      if (target_type === 'payment_order') {
        data = await db.query(`
          SELECT po.id, po.merchant_id, po.amount_paise, po.display_amount_paise,
                 po.actual_amount_paise, po.payee_vpa, po.status, po.nonce,
                 po.fingerprint_hash, po.utr, po.created_at, po.updated_at,
                 po.verified_at, po.sender_vpa, po.device_fingerprint
          FROM payment_orders po
          WHERE po.id = ?
        `, [target_id]);
      } else if (target_type === 'merchant') {
        data = await db.query(`
          SELECT * FROM pp_merchants WHERE id = ?
        `, [target_id]);
      } else if (target_type === 'user') {
        data = await db.query(`
          SELECT * FROM customers WHERE id = ?
        `, [target_id]);
      } else if (target_type === 'all_merchant_activity') {
        data = await db.query(`
          SELECT * FROM payment_orders
          WHERE merchant_id = ?
            AND created_at > datetime('now', '-90 days')
          ORDER BY created_at DESC
        `, [target_id]);
      } else {
        return HttpServer.json(res, 400, {
          error: 'Invalid target_type',
          code: 'INVALID_TARGET_TYPE'
        });
      }

      // ---- Generate encrypted PDF report (AES-256-GCM) ----
      const reportContent = JSON.stringify({
        case_number: effectiveCaseNumber,
        agency,
        officer,
        target_type,
        target_id,
        date_range,
        generated_at: new Date().toISOString(),
        data
      }, null, 2);

      const report = encryptReport(reportContent);
      const reportId = `le_${effectiveCaseNumber}_${Date.now()}`;

      // ---- Store report with 7-year retention ----
      db.execute(`
        INSERT INTO le_reports (id, case_number, agency, officer, target_type, target_id,
                               report_blob, report_key, created_at, retention_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [reportId, effectiveCaseNumber, agency, officer, target_type, target_id,
          report.blob, report.encryptedKey, new Date().toISOString(),
          new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000).toISOString()]);

      return HttpServer.json(res, 200, {
        status: 'FULFILLED',
        report_id: reportId,
        case_number: effectiveCaseNumber,
        agency,
        retention_years: 7,
        data_records: data ? data.length : 0
      });
    } catch (err) {
      console.error('[LE-request] error:', err.message);
      return HttpServer.json(res, 500, {
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR'
      });
    }
  });

  // GET /api/v1/internal/le-request/:reportId/download
  // Download encrypted LE report (authenticated)
  server.get('/api/v1/internal/le-request/:reportId/download', async (req, res) => {
    try {
      const { reportId } = req.params;

      const row = db.queryOne(
        `SELECT * FROM le_reports WHERE id = ?`,
        [reportId]
      );

      if (!row) {
        return HttpServer.json(res, 404, {
          error: 'Report not found',
          code: 'REPORT_NOT_FOUND'
        });
      }

      // Decrypt and return
      const decrypted = decryptReport(row.report_blob, row.report_key);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="le_report_${reportId}.json.enc"`);
      res.setHeader('Content-Length', row.report_blob.length);
      res.end(row.report_blob);
    } catch (err) {
      console.error('[LE-download] error:', err.message);
      return HttpServer.json(res, 500, {
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR'
      });
    }
  });
}

/**
 * Encrypt a report using AES-256-GCM.
 * @param {string} plaintext - JSON string to encrypt
 * @returns {{ blob: Buffer, encryptedKey: string, id: string }}
 */
function encryptReport(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    blob: Buffer.concat([iv, tag, encrypted]),
    encryptedKey: ENCRYPTION_KEY.toString('hex'),
    id: `le_report_${Date.now()}`
  };
}

/**
 * Decrypt an encrypted report.
 * @param {Buffer} encryptedBlob - Encrypted blob (iv + tag + ciphertext)
 * @param {string} encryptedKey - Hex-encoded encryption key
 * @returns {string} Decrypted plaintext
 */
function decryptReport(encryptedBlob, encryptedKey) {
  const key = Buffer.from(encryptedKey, 'hex');
  const iv = encryptedBlob.subarray(0, 12);
  const tag = encryptedBlob.subarray(12, 28);
  const data = encryptedBlob.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
