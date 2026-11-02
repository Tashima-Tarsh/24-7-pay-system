/**
 * Device Binding Helper — utility for merchant portal to create pairing QR and
 * for Android app to bind to merchant.
 */
import crypto from 'node:crypto';

export class DeviceBindingService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a pairing session for a merchant. Returns QR code data.
   */
  async createPairing(merchantId, options = {}) {
    const pairingId = crypto.randomUUID();
    const pairingToken = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Number(options.expiresInMinutes || 10) * 60 * 1000).toISOString();

    this.db.execute(
      `INSERT INTO device_pairing_sessions (id, merchant_id, device_name, pairing_token,
              status, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)`,
      [pairingId, merchantId, options.deviceName || null, pairingToken, expiresAt, now, now]
    );

    const pairingUrl = `${process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100'}/api/v1/device/pairing/join?token=${pairingToken}`;

    return {
      pairingId, pairingToken, pairingUrl, qrData: pairingUrl, expiresAt,
      merchantId, status: 'PENDING'
    };
  }

  /**
   * Get all active devices for a merchant.
   */
  getDevices(merchantId) {
    return this.db.query(
      `SELECT id, device_id, device_fingerprint, device_model, android_id,
              is_active, paired_at, last_active_at
       FROM merchant_devices WHERE merchant_id = $1 AND is_active = 1
       ORDER BY paired_at DESC`,
      [merchantId]
    ) || [];
  }

  /**
   * Check if a device is bound and active for a merchant.
   */
  isDeviceBound(merchantId, deviceId) {
    const row = this.db.queryOne(
      `SELECT id FROM merchant_devices WHERE id = $1 AND merchant_id = $2 AND is_active = 1`,
      [deviceId, merchantId]
    );
    return Boolean(row);
  }

  /**
   * Record device heartbeat.
   */
  heartbeat(deviceId) {
    this.db.execute('UPDATE merchant_devices SET last_active_at = $1 WHERE id = $2',
      [new Date().toISOString(), deviceId]);
  }
}
