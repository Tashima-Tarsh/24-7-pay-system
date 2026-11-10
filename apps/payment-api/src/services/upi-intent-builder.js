/**
 * BULLETPROOF UPI Intent Builder (adapted to 24-7-pay-system codebase)
 * Generates raw UPI URI and Android Intent URI for GPay, PhonePe, Paytm, BHIM.
 * Sanitizes inputs, enforces NPCI limits, formats Android Intent perfectly.
 */
import { buildUpiIntentUri, isValidVpa } from '@youpi/common';

/**
 * Exact package names for major UPI apps.
 */
export const UPI_PACKAGES = {
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
  bhim: 'in.org.npci.upiapp',
  amazonpay: 'in.amazon.mShopAndroid',
  cred: 'com.cred.app',
  whatsapp: 'com.whatsapp',
  generic: '' // Empty string lets Android OS show the native app chooser
};

export const SUPPORTED_TARGET_APPS = Object.keys(UPI_PACKAGES);

/**
 * NPCI per-transaction limit: ₹1,00,000 = 10000000 paise.
 */
export const NPCI_MAX_AMOUNT_PAISE = 10000000;

/**
 * Validate VPA strictly (NPCI spec + homograph protection).
 * Delegates to the shared isValidVpa from @youpi/common.
 * @param {string} vpa
 * @returns {string} cleaned VPA
 */
export function validateVpa(vpa) {
  if (!vpa || typeof vpa !== 'string') {
    throw new Error('VPA is required');
  }
  const clean = vpa.trim();
  if (!isValidVpa(clean)) {
    throw new Error('Invalid VPA format. Must be: username@bankhandle');
  }
  return clean;
}

/**
 * Format amount to exactly 2 decimal places (GPay requirement).
 * @param {number|bigint} amountPaise
 * @returns {string|null} e.g. "500.00" or null
 */
export function formatAmount(amountPaise) {
  if (amountPaise === null || amountPaise === undefined) {
    return null;
  }
  const n = typeof amountPaise === 'bigint' ? Number(amountPaise) : amountPaise;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new Error('Amount must be a non-negative number (in paise)');
  }
  if (n === 0) {
    throw new Error('Amount cannot be zero');
  }
  if (n > NPCI_MAX_AMOUNT_PAISE) {
    throw new Error('Amount exceeds NPCI limit of ₹1,00,000');
  }
  return (n / 100).toFixed(2);
}

/**
 * Sanitize transaction reference (alphanumeric only, max 35 chars).
 * @param {string} ref
 * @returns {string}
 */
export function sanitizeTransactionRef(ref) {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Transaction reference is required');
  }
  const clean = ref.trim().replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length === 0) {
    throw new Error('Transaction reference must contain alphanumeric characters');
  }
  if (clean.length > 35) {
    throw new Error('Transaction reference too long (max 35 chars)');
  }
  return clean;
}

/**
 * Sanitize transaction note (max 30 chars, strip emojis).
 * @param {string} note
 * @returns {string}
 */
export function sanitizeTransactionNote(note) {
  if (!note) return 'Payment';
  let clean = String(note).trim();
  clean = clean
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[^\w\s]/g, '')
    .trim();
  return clean.substring(0, 30) || 'Payment';
}

/**
 * Build Android Intent URI for a specific target app.
 * Format: intent://pay?<query>#Intent;scheme=upi;package=<PKG>;S.browser_fallback_url=<URL>;end
 * @param {object} options
 * @param {string} options.payeeVpa
 * @param {string} options.payeeName
 * @param {number|bigint} options.amountPaise
 * @param {string} options.transactionRef
 * @param {string} [options.transactionNote]
 * @param {string} [options.targetApp='generic']
 * @param {string} [options.checkoutUrl]
 * @returns {{upiUri: string, intentUri: string, packageName: string, targetApp: string}}
 */
export function buildAndroidIntent(options, targetApp = 'generic', checkoutUrl = null) {
  const pa = validateVpa(options.payeeVpa);
  const pn = String(options.payeeName || 'Merchant').trim().substring(0, 50);
  const am = formatAmount(options.amountPaise);
  const tr = sanitizeTransactionRef(options.transactionRef);
  const tn = sanitizeTransactionNote(options.transactionNote);

  const intentUri = buildUpiIntentUri({
    payeeVpa: pa,
    payeeName: pn,
    amountPaise: typeof options.amountPaise === 'bigint' ? options.amountPaise : BigInt(Math.round(Number(options.amountPaise) || 0)),
    transactionRef: tr,
    transactionNote: tn,
    targetApp,
    checkoutUrl
  });

  const packageName = UPI_PACKAGES[targetApp] || '';

  // Extract the underlying upi:// URI for QR/code use.
  const queryPart = intentUri.split('#')[0].replace('intent://pay?', '');
  const upiUri = `upi://pay?${queryPart}`;

  return { upiUri, intentUri, packageName, targetApp };
}

/**
 * Generate complete payment intent data for frontend (all major apps).
 * @param {object} options
 * @param {string} options.baseUrl
 * @returns {{paymentId: string, amount: string|null, vpa: string, intents: Record<string, {upiUri, intentUri, packageName, targetApp}>, qrCode: string}}
 */
export function generatePaymentIntent(options, baseUrl) {
  const intents = {};
  for (const app of ['gpay', 'phonepe', 'paytm', 'bhim', 'generic']) {
    intents[app] = buildAndroidIntent(options, app, `${baseUrl}/status/${sanitizeTransactionRef(options.transactionRef)}`);
  }
  return {
    paymentId: sanitizeTransactionRef(options.transactionRef),
    amount: formatAmount(options.amountPaise),
    vpa: validateVpa(options.payeeVpa),
    intents,
    qrCode: intents.generic.upiUri
  };
}
