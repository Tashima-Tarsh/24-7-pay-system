import crypto from 'node:crypto';

const SECRET_KEY = process.env.ORDER_SIGNING_SECRET || 'change-me-in-production';
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface OrderPayload {
  order_id: string;
  amount_paise: number;
  payee_vpa: string;
  nonce: string;
  created_at: number;
  fingerprint_hash: string;
}

export interface VerifiedTokenPayload extends OrderPayload {
  valid: true;
}

export interface VerifiedTokenResult {
  valid: true;
  payload: OrderPayload;
}

export interface InvalidTokenResult {
  valid: false;
  payload?: undefined;
}

/**
 * Creates a signed order token for UPI payment verification.
 *
 * The token format is: base64(JSON.stringify(payload) + "|" + HMAC-SHA256(JSON.stringify(payload), SECRET_KEY))
 *
 * This token is returned to the merchant checkout page and must be presented
 * by the browser when the UPI app returns, allowing the server to verify that
 * the return originated from a legitimate payment initiation.
 *
 * @param payload - Order details including order_id, amount_paise, payee_vpa,
 *                  nonce, created_at, and fingerprint_hash
 * @returns Base64-encoded signed token string
 */
export function createSignedOrderToken(payload: OrderPayload): string {
  const data = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(data, 'utf8')
    .digest('hex');

  return Buffer.from(`${data}|${signature}`).toString('base64');
}

/**
 * Verifies a signed order token and returns the decoded payload if valid.
 *
 * Verification checks:
 *   1. Token is valid base64 with data|signature format
 *   2. HMAC-SHA256 signature matches (prevents token forgery)
 *   3. Token is not expired (created_at within NONCE_EXPIRY_MS)
 *
 * @param token - The signed token string received from the checkout page
 * @returns Verification result with payload if valid, or valid: false if invalid
 */
export function verifySignedOrderToken(token: string): { valid: true; payload: OrderPayload } | { valid: false; payload?: undefined } {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const separatorIndex = decoded.lastIndexOf('|');

    if (separatorIndex === -1 || separatorIndex === 0 || separatorIndex === decoded.length - 1) {
      return { valid: false };
    }

    const dataStr = decoded.substring(0, separatorIndex);
    const signature = decoded.substring(separatorIndex + 1);

    if (!dataStr || !signature) {
      return { valid: false };
    }

    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(dataStr, 'utf8')
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return { valid: false };
    }

    // Parse payload
    const payload: OrderPayload = JSON.parse(dataStr);

    // Validate required fields
    if (!payload.order_id || !payload.nonce || !payload.fingerprint_hash || typeof payload.amount_paise !== 'number' || typeof payload.created_at !== 'number') {
      return { valid: false };
    }

    // Check expiry (5 minute window)
    const now = Date.now();
    if (now - payload.created_at > NONCE_EXPIRY_MS) {
      return { valid: false };
    }
    if (payload.created_at > now + 60000) {
      // Token created in the future (clock skew tolerance of 1 minute)
      return { valid: false };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Generates a cryptographically secure nonce for order tracking.
 * @returns A random UUID string suitable for use as a one-time nonce
 */
export function generateOrderNonce(): string {
  return crypto.randomUUID();
}

export { SECRET_KEY, NONCE_EXPIRY_MS };
