import crypto from 'node:crypto';
import { encryptAtRest, decryptAtRest } from '@youpi/common';

const COLUMNS = [
  'merchant_id', 'payee_vpa', 'payee_name', 'payee_email', 'mcc', 'orgid',
  'intent_sign_key_pem', 'support_phone', 'is_active', 'created_at', 'updated_at'
];

export class PpMerchantPaymentProfileRepository {
  constructor(db) {
    this.db = db;
  }

  mapRow(row) {
    return {
      merchantId: row.merchant_id,
      payeeVpa: row.payee_vpa,
      payeeName: row.payee_name,
      payeeEmail: row.payee_email,
      mcc: row.mcc,
      orgid: row.orgid,
      intentSignKeyPem: row.intent_sign_key_pem ? decryptAtRest(row.intent_sign_key_pem) : null,
      supportPhone: row.support_phone,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  findByMerchantId(merchantId) {
    const row = this.db.queryOne(
      'SELECT * FROM pp_merchant_payment_profile WHERE merchant_id = ?',
      [merchantId]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  findActiveByMerchantId(merchantId) {
    const row = this.db.queryOne(
      'SELECT * FROM pp_merchant_payment_profile WHERE merchant_id = ? AND is_active = 1',
      [merchantId]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  upsert(merchantId, data) {
    const now = new Date().toISOString();
    const existing = this.findByMerchantId(merchantId);
    const encryptedKey = data.intentSignKeyPem !== undefined
      ? encryptAtRest(data.intentSignKeyPem || null)
      : (existing ? existing.intentSignKeyPem : null);

    const isActive = data.isActive !== undefined ? (Boolean(data.isActive) ? 1 : 0) : 0;

    if (existing) {
      this.db.execute(`
        UPDATE pp_merchant_payment_profile
        SET payee_vpa = ?, payee_name = ?, payee_email = ?, mcc = ?, orgid = ?,
            intent_sign_key_pem = ?, support_phone = ?, is_active = ?, updated_at = ?
        WHERE merchant_id = ?
      `, [
        data.payeeVpa, data.payeeName, data.payeeEmail, data.mcc || '5411',
        data.orgid || null, encryptedKey, data.supportPhone || null, isActive, now, merchantId
      ]);
    } else {
      this.db.execute(`
        INSERT INTO pp_merchant_payment_profile (
          merchant_id, payee_vpa, payee_name, payee_email, mcc, orgid,
          intent_sign_key_pem, support_phone, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        merchantId, data.payeeVpa, data.payeeName, data.payeeEmail,
        data.mcc || '5411', data.orgid || null, encryptedKey,
        data.supportPhone || null, isActive, now, now
      ]);
    }
    return this.findByMerchantId(merchantId);
  }

  setActive(merchantId, isActive) {
    const now = new Date().toISOString();
    this.db.execute(
      'UPDATE pp_merchant_payment_profile SET is_active = ?, updated_at = ? WHERE merchant_id = ?',
      [isActive ? 1 : 0, now, merchantId]
    );
    return this.findByMerchantId(merchantId);
  }

  hasActiveSessions(merchantId) {
    const rows = this.db.query(`
      SELECT id FROM payment_sessions
      WHERE merchant_id = ? AND status IN ('ACTIVE', 'VERIFICATION_PENDING')
    `, [merchantId]);
    return rows.length > 0;
  }
}
