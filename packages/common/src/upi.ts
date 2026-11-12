import { toRupeesString } from './money.js';

/**
 * Normalizes a payee name for UPI: NFC normalization, strips control chars,
 * collapses whitespace, enforces 1–50 character limit. Preserves Indian
 * and other non-ASCII letters that URLSearchParams encodes safely.
 * @param {string} value
 * @returns {string}
 */
export function normalizePayeeName(value: string): string {
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

export interface BuildUpiUriOptions {
  payeeVpa: string;
  payeeName: string;
  amountPaise: bigint;
  transactionRef: string;
  transactionNote?: string;
  currency?: string;
  merchantCategoryCode?: string;
  /** Presence of a PSP signing key is the only proof this is a registered merchant. */
  intentSignKeyPem?: string;
}

/**
 * Validates whether a given string is a syntactically valid UPI Virtual Payment Address (VPA).
 * Format: username@bank
 */
export function isValidVpa(vpa: string): boolean {
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
 * Builds a canonical upi://pay URI dynamically from server-validated parameters.
 * Amount is derived exclusively from server-side integer paise.
 */
export function buildUpiUri(options: BuildUpiUriOptions): string {
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

  return `upi://pay?${params.toString()}`;
}

export interface BuildUpiIntentUriOptions extends BuildUpiUriOptions {
  targetApp?: 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'generic';
  checkoutUrl?: string;
}

/**
 * Builds a hardened Android UPI intent URI for GPay, PhonePe, Paytm and BHIM.
 * Sanitizes inputs, enforces NPCI limits, and formats the intent exactly.
 * Format: intent://pay?<params>#Intent;scheme=upi;package=<PACKAGE>;S.browser_fallback_url=<URL>;end
 */
export function buildUpiIntentUri(options: BuildUpiIntentUriOptions): string {
  // 1. Sanitize VPA (Strict validation)
  const pa = String(options.payeeVpa).trim();
  if (!isValidVpa(pa)) {
    throw new Error('Invalid UPI VPA. Ensure format is: username@bank');
  }

  // 2. Sanitize Payee Name (Max 50 chars. NFC-normalized; URLSearchParams encodes safely)
  const pn = normalizePayeeName(options.payeeName);

  // 3. Format Amount (GPay STRICTLY requires exactly 2 decimal places, e.g., "50.00")
  let am: string | undefined;
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
  params.set('tr', tr);
  params.set('tn', tn);
  // A merchant declaration (mc/tid/mode) is only legal for a PSP-registered merchant.
  // A signing key is the only proof of that registration we hold; a bare 4-digit MCC
  // (or the seeded default '5411') is not. Emitting it makes GPay/PhonePe classify the
  // payment as P2M and reject it BEFORE the PIN with "exceeds the limit set by your bank".
  const hasMerchantCode = Boolean(options.intentSignKeyPem)
    && /^\d{4}$/.test(String(options.merchantCategoryCode || ''));
  if (hasMerchantCode) {
    params.set('tid', tr);
    params.set('mc', String(options.merchantCategoryCode));
    params.set('mode', '02'); // mandatory whenever mc is declared (P2M)
  }

  // Replace '+' with '%20' for maximum compatibility with older UPI app parsers
  const queryString = params.toString().replace(/\+/g, '%20');

  // 7. Define Exact Package Names for Top UPI Apps
  const packages: Record<string, string> = {
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
  // Resolve the Chrome fallback URL without ever failing the payment. A merchant's own
  // returnUrl (http://, localhost, LAN IP) used to throw here, turning a create request
  // into a 500. An unusable value now degrades to "no fallback" instead.
  const usableFallback = (value?: string): string | null => {
    const candidate = String(value || '').trim();
    if (!candidate) return null;
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(candidate)) return null;
    return /^https?:\/\//i.test(candidate) ? candidate : null;
  };
  const checkoutUrl = usableFallback(options.checkoutUrl)
    || usableFallback(process.env.PUBLIC_CHECKOUT_URL)
    || null;

  // No package => return a plain upi:// link. Android resolves it to the native
  // "open with" app chooser, which is what an un-branded button needs. An intent://
  // URI with neither package nor component is unreliable across Android builds.
  if (!targetPackage) {
    return `upi://pay?${queryString}`;
  }

  let intentUri = `intent://pay?${queryString}#Intent;scheme=upi`;

  if (targetPackage) {
    intentUri += `;package=${targetPackage}`;
  }

  if (checkoutUrl) {
    intentUri += `;S.browser_fallback_url=${encodeURIComponent(checkoutUrl)}`;
  }

  intentUri += ';end';

  return intentUri;
}
