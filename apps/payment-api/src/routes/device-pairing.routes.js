import { HttpServer } from '../server.js';
import QRCode from 'qrcode';

/**
 * Device Pairing & Binding — connects Android mobile app to merchant portal.
 * Portal shows a QR code; Android app scans it to bind the device to the merchant.
 * Once bound, the Android SMS observer can submit evidence for that merchant's payments.
 * Both Super Admin and Merchant Owner can create pairing sessions and bind devices.
 */
export function registerDevicePairingRoutes(server, ctx) {
  const db = ctx.db;

  /**
   * Extract auth token from either Bearer header or session cookie.
   * Supports Super Admin (platform session) and Merchant Owner.
   */
  function getAuthToken(req) {
    // Try Bearer token first
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match) return match[1].trim();

    // Try cookie-based session (dp_platform_session)
    const cookie = req.headers.cookie || '';
    const cookieMatch = /dp_platform_session=([^;]+)/.exec(cookie);
    if (cookieMatch) return cookieMatch[1].trim();

    return '';
  }

  // POST /api/v1/device/pairing/create — create a pairing session (QR code data)
  server.post('/api/v1/device/pairing/create', async (req, res) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { merchantId, deviceName, expiresInMinutes } = body;
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });

    const pairingId = crypto.randomUUID();
    const pairingToken = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Number(expiresInMinutes || 10) * 60 * 1000).toISOString();

    // Store pairing session
    db.execute(
      `INSERT INTO device_pairing_sessions (id, merchant_id, device_name, pairing_token,
              status, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)`,
      [pairingId, merchantId, deviceName || null, pairingToken, expiresAt, now, now]
    );

    // Pairing URL that the Android app will open/scan
    const pairingUrl = `${process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100'}/api/v1/device/pairing/join?token=${pairingToken}`;

    // Generate QR code data URL for desktop users to scan with their phone camera
    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(pairingUrl, { width: 300, margin: 2 });
    } catch {}

    return HttpServer.json(res, 201, {
      pairingId, pairingToken, pairingUrl, expiresAt,
      qrData: pairingUrl,
      qrDataUrl,
      note: 'Desktop: display qrDataUrl as an image. Android: scan this QR or open pairingUrl to bind the device to the merchant'
    });
  });

  // GET /api/v1/device/pairing/join — Android app joins via pairing token (QR scan)
  server.get('/api/v1/device/pairing/join', async (req, res) => {
    const { token } = req.query || {};
    if (!token) return HttpServer.json(res, 400, { error: 'token required' });

    const session = db.queryOne(
      `SELECT * FROM device_pairing_sessions WHERE pairing_token = $1 AND status = 'PENDING'`,
      [token]
    );
    if (!session) return HttpServer.json(res, 404, { error: 'Pairing session not found or expired' });
    if (new Date(session.expires_at) < new Date()) {
      db.execute('UPDATE device_pairing_sessions SET status = $1 WHERE id = $2', ['EXPIRED', session.id]);
      return HttpServer.json(res, 410, { error: 'Pairing session expired' });
    }

    // Return pairing confirmation data for the Android app
    return HttpServer.json(res, 200, {
      pairingId: session.id, merchantId: session.merchant_id, deviceName: session.device_name,
      status: 'PENDING', expiresAt: session.expires_at,
      note: 'Android app should call /api/v1/device/pairing/bind with this pairingId and device fingerprint'
    });
  });

  // POST /api/v1/device/pairing/bind — Android app binds device fingerprint to pairing session
  server.post('/api/v1/device/pairing/bind', async (req, res) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { pairingId, deviceFingerprint, deviceModel, androidId, fcmToken } = body;
    if (!pairingId || !deviceFingerprint) return HttpServer.json(res, 400, { error: 'pairingId and deviceFingerprint required' });

    const session = db.queryOne('SELECT * FROM device_pairing_sessions WHERE id = $1 AND status = \'PENDING\'', [pairingId]);
    if (!session) return HttpServer.json(res, 404, { error: 'Pairing session not found or already used' });
    if (new Date(session.expires_at) < new Date()) {
      db.execute('UPDATE device_pairing_sessions SET status = $1 WHERE id = $2', ['EXPIRED', session.id]);
      return HttpServer.json(res, 410, { error: 'Pairing session expired' });
    }

    const deviceId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Bind device to merchant
    db.execute(
      `INSERT INTO merchant_devices (id, merchant_id, device_id, device_fingerprint, device_model,
              android_id, fcm_token, is_active, paired_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10)`,
      [deviceId, session.merchant_id, deviceId, deviceFingerprint, deviceModel || null,
       androidId || null, fcmToken || null, now, now, now]
    );

    // Mark pairing session as completed
    db.execute('UPDATE device_pairing_sessions SET status = $1, updated_at = $2 WHERE id = $3',
      ['BOUND', now, session.id]);

    return HttpServer.json(res, 200, {
      deviceId, merchantId: session.merchant_id, deviceFingerprint,
      isActive: true, pairedAt: now,
      note: 'Android device bound to merchant — SMS observer can now submit evidence for this merchant\'s payments'
    });
  });

  // POST /api/v1/device/pairing/macrodroid/bind — MacroDroid-specific bind (no session cookie needed)
  // MacroDroid scans QR code, extracts pairingToken from URL, posts here to bind device
  server.post('/api/v1/device/pairing/macrodroid/bind', async (req, res) => {
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { pairingToken, deviceFingerprint, deviceModel, androidId, fcmToken, merchantId } = body;
    if (!pairingToken || !deviceFingerprint) return HttpServer.json(res, 400, { error: 'pairingToken and deviceFingerprint required' });

    const session = db.queryOne('SELECT * FROM device_pairing_sessions WHERE pairing_token = $1 AND status = \'PENDING\'', [pairingToken]);
    if (!session) return HttpServer.json(res, 404, { error: 'Pairing session not found or already used' });
    if (new Date(session.expires_at) < new Date()) {
      db.execute('UPDATE device_pairing_sessions SET status = $1 WHERE id = $2', ['EXPIRED', session.id]);
      return HttpServer.json(res, 410, { error: 'Pairing session expired' });
    }

    const deviceId = crypto.randomUUID();
    const now2 = new Date().toISOString();

    // Bind device to merchant
    db.execute(
      `INSERT INTO merchant_devices (id, merchant_id, device_id, device_fingerprint, device_model,
              android_id, fcm_token, is_active, paired_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10)`,
      [deviceId, session.merchant_id, deviceId, deviceFingerprint, deviceModel || null,
       androidId || null, fcmToken || null, now2, now2, now2]
    );

    // Mark pairing session as completed
    db.execute('UPDATE device_pairing_sessions SET status = $1, updated_at = $2 WHERE id = $3',
      ['BOUND', now2, session.id]);

    return HttpServer.json(res, 200, {
      deviceId, merchantId: session.merchant_id, deviceFingerprint,
      isActive: true, pairedAt: now2,
      note: 'MacroDroid device bound to merchant — SMS observer can now submit evidence for this merchant\'s payments'
    });
  });

  // GET /api/v1/device/pairing/status/:pairingId — check pairing status
  server.get('/api/v1/device/pairing/status/:pairingId', async (req, res, params) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const session = db.queryOne('SELECT * FROM device_pairing_sessions WHERE id = $1', [params.pairingId]);
    if (!session) return HttpServer.json(res, 404, { error: 'Pairing session not found' });
    return HttpServer.json(res, 200, {
      pairingId: session.id, merchantId: session.merchant_id, deviceName: session.device_name,
      status: session.status, expiresAt: session.expires_at, createdAt: session.created_at
    });
  });

  // GET /api/v1/devices — list bound devices for a merchant
  server.get('/api/v1/devices', async (req, res) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const { merchantId } = req.query || {};
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });
    const rows = db.query(
      `SELECT id, device_id, device_fingerprint, device_model, android_id, fcm_token,
              is_active, paired_at, last_active_at, created_at
       FROM merchant_devices WHERE merchant_id = $1 ORDER BY paired_at DESC`,
      [merchantId]
    );
    return HttpServer.json(res, 200, {
      devices: (rows || []).map(r => ({
        deviceId: r.id, deviceFingerprint: r.device_fingerprint, deviceModel: r.device_model,
        androidId: r.android_id, fcmToken: r.fcm_token, isActive: Boolean(r.is_active),
        pairedAt: r.paired_at, lastActiveAt: r.last_active_at
      })),
      count: (rows || []).length
    });
  });

  // PATCH /api/v1/devices/:deviceId — toggle device active/inactive
  server.patch('/api/v1/devices/:deviceId', async (req, res, params) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { isActive } = body;
    const row = db.queryOne('SELECT * FROM merchant_devices WHERE id = $1', [params.deviceId]);
    if (!row) return HttpServer.json(res, 404, { error: 'Device not found' });
    db.execute('UPDATE merchant_devices SET is_active = $1, updated_at = $2 WHERE id = $3',
      [isActive ? 1 : 0, new Date().toISOString(), params.deviceId]);
    return HttpServer.json(res, 200, { updated: true, deviceId: params.deviceId, isActive: Boolean(isActive) });
  });

  // DELETE /api/v1/devices/:deviceId — unbind device
  server.delete('/api/v1/devices/:deviceId', async (req, res, params) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    db.execute('DELETE FROM merchant_devices WHERE id = $1', [params.deviceId]);
    return HttpServer.json(res, 200, { deleted: true, deviceId: params.deviceId });
  });

  // POST /api/v1/devices/:deviceId/heartbeat — device heartbeat (keepalive)
  server.post('/api/v1/devices/:deviceId/heartbeat', async (req, res, params) => {
    const token = getAuthToken(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    db.execute('UPDATE merchant_devices SET last_active_at = $1 WHERE id = $2',
      [new Date().toISOString(), params.deviceId]);
    return HttpServer.json(res, 200, { ok: true, deviceId: params.deviceId });
  });
}

import crypto from 'node:crypto';
