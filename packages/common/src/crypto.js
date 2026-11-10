import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Encrypts plaintext string using AES-256-GCM.
 * Output format: iv_hex:authTag_hex:cipher_hex
 * @param {string} plaintext
 * @param {string} masterKeyHex
 * @returns {string}
 */
export function encrypt(plaintext, masterKeyHex) {
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Master key must be a 32-byte (64 hex characters) string.');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext payload.
 * @param {string} encryptedPayload
 * @param {string} masterKeyHex
 * @returns {string}
 */
export function decrypt(encryptedPayload, masterKeyHex) {
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Master key must be a 32-byte (64 hex characters) string.');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:authTag:cipher.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Generates an HMAC-SHA256 signature for webhooks and device authentication.
 * @param {string} data
 * @param {string} secret
 * @returns {string}
 */
export function generateHmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/**
 * Timing-safe HMAC signature verification.
 * @param {string} data
 * @param {string} secret
 * @param {string} expectedSignature
 * @returns {boolean}
 */
export function verifyHmac(data, secret, expectedSignature) {
  const actualSignature = generateHmac(data, secret);
  const actualBuffer = Buffer.from(actualSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Verifies a Svix-style webhook payload with timestamp-based replay protection.
 * Expected headers: X-Gateway-Delivery-Id, X-Gateway-Timestamp, X-Gateway-Signature.
 * Signature = HMAC-SHA256(secret, deliveryId + "." + timestamp + "." + rawBody).
 * @param {string} rawBody - Raw request body string
 * @param {string} secret - Merchant webhook secret
 * @param {Object} headers - { 'x-gateway-delivery-id': string, 'x-gateway-timestamp': string, 'x-gateway-signature': string }
 * @param {Object} [opts] - { toleranceSeconds?: number, seenIds?: Set<string> }
 * @returns {{ valid: boolean, reason?: string, deliveryId?: string, timestamp?: number }}
 */
export function verifyWebhookPayload(rawBody, secret, headers, opts = {}) {
  const toleranceSeconds = opts.toleranceSeconds !== undefined ? opts.toleranceSeconds : 300; // 5 minutes
  const now = Math.floor(Date.now() / 1000);

  const deliveryId = headers['x-gateway-delivery-id'] || headers['X-Gateway-Delivery-Id'];
  const timestampStr = headers['x-gateway-timestamp'] || headers['X-Gateway-Timestamp'];
  const signature = headers['x-gateway-signature'] || headers['X-Gateway-Signature'];

  if (!deliveryId || !timestampStr || !signature) {
    return { valid: false, reason: 'Missing required webhook headers' };
  }

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: 'Invalid timestamp' };
  }

  // Replay protection: reject timestamps outside tolerance window
  const ageSeconds = Math.abs(now - timestamp);
  if (ageSeconds > toleranceSeconds) {
    return { valid: false, reason: 'Timestamp outside tolerance window' };
  }

  // Idempotency: reject duplicate delivery IDs
  if (opts.seenIds && opts.seenIds.has(deliveryId)) {
    return { valid: false, reason: 'Duplicate delivery ID' };
  }

  // Signature verification: Svix-style signed content = id.timestamp.body
  const signedContent = `${deliveryId}.${timestampStr}.${rawBody}`;
  if (!verifyHmac(signedContent, secret, signature)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  if (opts.seenIds) {
    opts.seenIds.add(deliveryId);
  }

  return { valid: true, deliveryId, timestamp };
}

/**
 * Generates Svix-style webhook signature headers for outbound delivery.
 * Signature = HMAC-SHA256(secret, rawBody) for backward compatibility.
 * Headers include X-Gateway-Delivery-Id, X-Gateway-Timestamp, X-Gateway-Signature.
 * @param {string} rawBody - Raw request body string
 * @param {string} secret - Merchant webhook secret
 * @param {string} [deliveryId] - Unique delivery ID (auto-generated if omitted)
 * @param {number} [timestamp] - Unix timestamp (auto-generated if omitted)
 * @returns {{ 'x-gateway-delivery-id': string, 'x-gateway-timestamp': string, 'x-gateway-signature': string }}
 */
export function signWebhookPayload(rawBody, secret, deliveryId = null, timestamp = null) {
  const id = deliveryId || crypto.randomUUID();
  const ts = timestamp !== null && timestamp !== undefined ? timestamp : Math.floor(Date.now() / 1000);
  const signature = generateHmac(rawBody, secret);
  return {
    'x-gateway-delivery-id': id,
    'x-gateway-timestamp': String(ts),
    'x-gateway-signature': 'sha256=' + signature
  };
}

/**
 * Generates a cryptographically secure random hex string.
 * @param {number} [bytes=32]
 * @returns {string}
 */
export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hashes a password using PBKDF2 with SHA-512 and salt.
 * Format: iterations:salt_hex:hash_hex
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `${iterations}:${salt}:${hash}`;
}

/**
 * Verifies a password against a stored PBKDF2 hash.
 * @param {string} password
 * @param {string} storedHash
 * @returns {boolean}
 */
export function verifyPassword(password, storedHash) {
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;

  const iterations = parseInt(parts[0], 10);
  const salt = parts[1];
  const originalHash = parts[2];

  const checkHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(checkHash, 'hex'), Buffer.from(originalHash, 'hex'));
}
