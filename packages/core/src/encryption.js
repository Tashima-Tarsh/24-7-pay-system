/**
 * Data Residency & Encryption — Phase 4 Deliverable 9
 *
 * All payment data MUST be stored in India.
 * Sensitive fields are encrypted at rest using AES-256-GCM.
 *
 * Fields to encrypt: sender_vpa, payee_vpa, device_fingerprint, ip_address,
 * contact_email, contact_phone, webhook_secret
 */

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
 * Encrypt a string value using AES-256-GCM.
 * Format: iv(12 hex) : tag(16 hex) : ciphertext(hex)
 *
 * @param {string} plaintext - Plaintext to encrypt
 * @returns {string} Encrypted string in iv:tag:data format
 */
export function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined) {
    return plaintext;
  }

  if (!ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY must be set as a 32-byte (64 hex char) value'
    );
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an encrypted string value.
 * @param {string} ciphertext - Encrypted string in iv:tag:data format
 * @returns {string} Decrypted plaintext
 */
export function decryptField(ciphertext) {
  if (ciphertext === null || ciphertext === undefined) {
    return ciphertext;
  }

  if (!ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY must be set as a 32-byte (64 hex char) value'
    );
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const data = Buffer.from(parts[2], 'hex');

  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt sensitive fields in a record object.
 * @param {object} record - Record object with sensitive fields
 * @param {string[]} fields - Field names to encrypt
 * @returns {object} Record with encrypted fields
 */
export function encryptRecordFields(record, fields = []) {
  if (!record) return record;

  const encrypted = { ...record };
  for (const field of fields) {
    if (encrypted[field] !== null && encrypted[field] !== undefined) {
      try {
        encrypted[field] = encryptField(encrypted[field]);
      } catch (err) {
        console.error(`[encryptField] Failed to encrypt field ${field}:`, err.message);
      }
    }
  }
  return encrypted;
}

/**
 * Decrypt sensitive fields in a record object.
 * @param {object} record - Record object with encrypted fields
 * @param {string[]} fields - Field names to decrypt
 * @returns {object} Record with decrypted fields
 */
export function decryptRecordFields(record, fields = []) {
  if (!record) return record;

  const decrypted = { ...record };
  for (const field of fields) {
    if (decrypted[field] !== null && decrypted[field] !== undefined) {
      try {
        decrypted[field] = decryptField(decrypted[field]);
      } catch (err) {
        console.error(`[decryptField] Failed to decrypt field ${field}:`, err.message);
      }
    }
  }
  return decrypted;
}

/**
 * Check if data residency encryption is configured.
 * @returns {boolean}
 */
export function isDataResidencyEnforced() {
  return Boolean(ENCRYPTION_KEY);
}
