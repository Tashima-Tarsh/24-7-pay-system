import { toRupeesString } from './money.js';

// A previously bundled, real-world VPA is explicitly retired from this product.
// This is a revocation guard, never a default payee or a test payment destination.
export function isRetiredReceivingVpa(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === '9082843142@slc';
}

/**
 * Normalizes a payee name for UPI: NFC normalization, strips control chars,
 * collapses whitespace, enforces 1–50 character limit. Preserves Indian
 * and other non-ASCII letters that URLSearchParams encodes safely.
 * @param {string} value
 * @returns {string}
 */
export function normalizePayeeName(value) {
  if (typeof value !== 'string') throw new Error('Payee name is required');
  const name = value.normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!name || Array.from(name).length > 50) {
    throw new Error('Registered payee name must contain 1–50 characters');
  }
  return name;
}

/**
 * Validates whether a given string is a syntactically valid UPI Virtual Payment Address (VPA).
 * Format: username@bank
 * @param {string} vpa
 * @returns {boolean}
 */
export function isValidVpa(vpa) {
  if (!vpa || typeof vpa !== 'string') return false;
  const clean = vpa.trim();

  // Reject non-ASCII characters (homograph / IDN lookalike prevention)
  if (/[^\x00-\x7F]/.test(clean)) return false;

  // Strict NPCI format: username@bank
  const vpaRegex = /^[a-z0-9.\-_]{2,256}@[a-z0-9.\-_]{2,64}$/i;
  if (!vpaRegex.test(clean)) return false;

  // Reject consecutive dots/dashes/underscores
  if (/\.\./.test(clean) || /--/.test(clean) || /__/.test(clean)) return false;

  // Reject starting or ending with special characters
  if (/^[.\-_]/.test(clean) || /[.\-_]$/.test(clean)) return false;

  return true;
}

/**
 * Parameters that are safe on a payment request to a personal (P2P) UPI ID.
 *
 * Everything else in the NPCI intent vocabulary (`mc`, `tid`, `url`, `orgid`, `mode`,
 * `sign`, `mid`, `mam`) describes a transaction that a PSP has registered on behalf of
 * a merchant. A personal VPA has no such registration, so GPay/PhonePe accept the intent,
 * open the confirm screen and then fail the payment. Scanning the identical URI as a QR
 * works because the scanner path does not apply those merchant declarations.
 */
export const P2P_INTENT_PARAMS = Object.freeze(['pa', 'pn', 'am', 'cu', 'tr', 'tn']);

/**
 * Reduces any upi://pay URI to the parameters that are valid for a personal payee, so the
 * same order can be handed to a UPI app as an intent without declaring a merchant it is not.
 *
 * The returned query is single-encoded and uses %20 for spaces: Android hands the intent's
 * data URI to the payment app, which decodes percent escapes but not the form-encoded '+' —
 * a payee name would otherwise arrive as "Demo+Store".
 *
 * @param {string} upiUri
 * @returns {string} query string without the leading '?'
 */
export function toP2pIntentQuery(upiUri) {
  if (typeof upiUri !== 'string' || !upiUri.startsWith('upi://pay?')) {
    throw new Error('Invalid UPI URI');
  }
  const source = new URLSearchParams(upiUri.slice('upi://pay?'.length));
  const params = new URLSearchParams();
  for (const key of P2P_INTENT_PARAMS) {
    const value = source.get(key);
    if (value !== null && value !== '') params.set(key, value);
  }
  return params.toString().replace(/\+/g, '%20');
}

/**
 * @param {string} upiUri
 * @returns {string} upi://pay URI restricted to P2P-safe parameters
 */
export function toP2pIntentUri(upiUri) {
  return `upi://pay?${toP2pIntentQuery(upiUri)}`;
}

/**
 * Builds a canonical upi://pay URI dynamically from server-validated parameters.
 * Amount is derived exclusively from server-side integer paise.
 * @param {{
 *   payeeVpa: string,
 *   payeeName: string,
 *   amountPaise: bigint,
 *   transactionRef: string,
 *   transactionNote?: string,
 *   merchantCategoryCode?: string,
 *   transactionUrl?: string,
 *   currency?: string
 * }} options
 * @returns {string}
 */
export function buildUpiUri(options) {
  if (!isValidVpa(options.payeeVpa)) {
    throw new Error(`Invalid payee VPA: ${options.payeeVpa}`);
  }

  const amountStr = toRupeesString(options.amountPaise);

  const params = new URLSearchParams();
  params.set('pa', options.payeeVpa.trim());
  params.set('pn', options.payeeName.trim());
  params.set('am', amountStr);

  // Transaction Ref: alphanumeric only, max 35 chars (Paytm/PhonePe strict).
  const trRaw = String(options.transactionRef || '').trim();
  const tr = trRaw.replace(/[^a-zA-Z0-9]/g, '').substring(0, 35);
  if (tr) params.set('tr', tr);

  // Transaction Note: max 30 chars per NPCI, strip emojis.
  const tnRaw = String(options.transactionNote || 'Payment').trim();
  const tn = tnRaw
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .substring(0, 30);
  if (tn) params.set('tn', tn);
  if (/^\d{4}$/.test(String(options.merchantCategoryCode || ''))) {
    if (tr) params.set('tid', tr);
    params.set('mc', options.merchantCategoryCode);
  }
  if (options.transactionUrl) {
    const transactionUrl = new URL(options.transactionUrl);
    if (transactionUrl.protocol !== 'https:') {
      throw new Error('Transaction URL must use HTTPS');
    }
    params.set('url', transactionUrl.toString());
  }
  params.set('cu', options.currency || 'INR');

  return `upi://pay?${params.toString()}`;
}

/**
 * Builds a hardened Android UPI intent URI for GPay, PhonePe, Paytm and BHIM.
 * Sanitizes inputs, enforces NPCI limits, and formats the intent exactly.
 * @param {{
 *   payeeVpa: string,
 *   payeeName: string,
 *   amountPaise: bigint,
 *   transactionRef: string,
 *   transactionNote?: string,
 *   currency?: string,
 *   targetApp?: 'gpay'|'phonepe'|'paytm'|'bhim'|'generic',
 *   checkoutUrl?: string
 * }} options
 * @returns {string}
 */
export function buildUpiIntentUri(options) {
  // 1. Sanitize VPA (Strict validation)
  const pa = String(options.payeeVpa).trim();
  if (!isValidVpa(pa)) {
    throw new Error('Invalid UPI VPA. Ensure format is: username@bank');
  }

  // 2. Sanitize Payee Name (Max 50 chars. NFC-normalized; URLSearchParams encodes safely)
  const pn = normalizePayeeName(options.payeeName);

  // 3. Format Amount (GPay STRICTLY requires exactly 2 decimal places, e.g., "50.00")
  let am;
  if (options.amountPaise !== undefined && options.amountPaise !== null) {
    const rupees = Number(options.amountPaise) / 100;
    am = rupees.toFixed(2);
  }

  // 4. Sanitize Transaction Ref (Alphanumeric ONLY, max 35 chars. Paytm/PhonePe reject special chars)
  const tr = String(options.transactionRef).trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 35);
  if (!tr) {
    throw new Error('Transaction Ref (tr) must be alphanumeric and non-empty');
  }

  // 5. Sanitize Transaction Note (Max 30 chars per NPCI. Strip emojis and special chars)
  const rawTn = String(options.transactionNote || 'Payment').trim();
  const tn = rawTn
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .substring(0, 30);

  // 6. Build Query String (URLSearchParams handles safe, single URL-encoding automatically)
  const params = new URLSearchParams();
  params.set('pa', pa);
  params.set('pn', pn);
  if (am) params.set('am', am);
  params.set('cu', 'INR'); // Mandatory for GPay
  params.set('tr', tr);   // Transaction Reference (merchant ref)
  params.set('tn', tn);
  // `tid` and `mc` declare a merchant transaction that NPCI/PSP has registered for an
  // acquirer. Sending them for a personal VPA makes GPay/PhonePe treat the intent as a
  // merchant payment for an unknown merchant and fail it. Only a caller that really has
  // a merchant category code may declare them.
  if (options.merchantCategoryCode && /^\d{4}$/.test(String(options.merchantCategoryCode))) {
    params.set('tid', tr);
    params.set('mc', String(options.merchantCategoryCode));
  }

  // Replace '+' with '%20' for maximum compatibility with older UPI app parsers
  const queryString = params.toString().replace(/\+/g, '%20');

  // 7. Define Exact Package Names for Top UPI Apps
  const packages = {
    gpay: 'com.google.android.apps.nbu.paisa.user',
    phonepe: 'com.phonepe.app',
    paytm: 'net.one97.paytm',
    bhim: 'in.org.npci.upiapp',
    generic: '' // Empty string lets Android OS show the native app chooser
  };

  const targetPackage = packages[options.targetApp || 'generic'];

  // 8. Construct Android Intent URI
  // Format: intent://pay?{query}#Intent;scheme=upi;package={package};S.browser_fallback_url={url};end
  // checkoutUrl is optional but strongly recommended. Falls back to PUBLIC_CHECKOUT_URL env var
  // so UPI apps redirect to the public domain (not localhost) on production deployments.
  const checkoutUrl = (options.checkoutUrl || process.env.PUBLIC_CHECKOUT_URL || 'http://localhost:7000').trim();

  // Production guard: refuse to emit intents with localhost/non-HTTPS fallback
  if (process.env.NODE_ENV === 'production') {
    if (!checkoutUrl || /localhost|127\.0\.0\.1/i.test(checkoutUrl) || !checkoutUrl.startsWith('https://')) {
      throw new Error('PUBLIC_CHECKOUT_URL must be set to the production HTTPS origin in production');
    }
  }

  let intentUri = `intent://pay?${queryString}#Intent;scheme=upi`;

  if (targetPackage) {
    intentUri += `;package=${targetPackage}`;
  }

  const fallbackUrl = encodeURIComponent(checkoutUrl);
  intentUri += `;S.browser_fallback_url=${fallbackUrl}`;

  intentUri += ';end';

  return intentUri;
}
