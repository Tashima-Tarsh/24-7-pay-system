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
  if (tr) params.set('tid', tr); // Transaction ID — mandatory per NPCI; GPay enforces this

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
  params.set('tid', tr); // Transaction ID — mandatory per NPCI; GPay enforces this
  params.set('tn', tn);
  if (options.merchantCategoryCode && /^\d{4}$/.test(String(options.merchantCategoryCode))) {
    params.set('mc', String(options.merchantCategoryCode));
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
