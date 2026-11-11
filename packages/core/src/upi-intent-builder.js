import crypto from 'node:crypto';

/**
 * UPI intent URI builder.
 *
 * Builds a canonical upi://pay query with parameters in a fixed order:
 *   pa, pn, am (2dp), cu=INR, tr, tid, tn, url (only if set),
 *   mc (only when the profile carries a real 4-digit MCC), mode=02, orgid (only if set)
 * All values are URL-encoded. Optionally appends `sign=` (RSA-SHA256 over the
 * query bytes, base64, URL-encoded) when the profile carries a signing key.
 *
 * The canonical URI is also the QR payload, so it keeps the full NPCI vocabulary.
 * Android hand-off is different: buildPackageIntent() strips it to the P2P-safe
 * parameter set unless the URI is PSP-signed.
 *
 * Never fails a payment: if signing throws, the unsigned URI is returned and a
 * warning is logged.
 */
export const UPI_PACKAGES = Object.freeze({
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
  bhim: 'in.org.npci.upiapp'
});

/**
 * Format integer paise as a 2-decimal rupee string using integer math only.
 * @param {bigint | number} amountPaise
 * @returns {string}
 */
function amountToRupees2dp(amountPaise) {
  const p = typeof amountPaise === 'bigint' ? amountPaise : BigInt(Math.floor(Number(amountPaise)));
  const whole = p / 100n;
  const fraction = p % 100n;
  return `${whole}.${fraction.toString().padStart(2, '0')}`;
}

/**
 * Strip every non-alphanumeric character and truncate to 35 chars (UTR ref).
 * @param {string} value
 * @returns {string}
 */
function trRef(value) {
  return String(value).replace(/[^A-Za-z0-9]/g, '').slice(0, 35);
}

/**
 * Strip truly dangerous chars (& % # +) and truncate to 50 chars (transaction note).
 * Spaces are preserved so notes remain readable.
 * @param {string} value
 * @returns {string}
 */
function tnNote(value) {
  return String(value).replace(/[&%#+]/g, '').slice(0, 50);
}

/**
 * Build the canonical upi://pay URI.
 * @param {{
 *   payeeVpa: string,
 *   payeeName: string,
 *   mcc?: string,
 *   orgid?: string,
 *   intentSignKeyPem?: string
 * }} profile
 * @param {bigint | number} amountPaise
 * @param {string} paymentId
 * @param {string} note
 * @param {string} [checkoutUrl] session checkout URL, emitted as `url=` before `mc`
 * @returns {{ uri: string, signed: boolean }}
 */
export function buildUpiUri(profile, amountPaise, paymentId, note, checkoutUrl) {
  const params = [];
  params.push(`pa=${encodeURIComponent(String(profile.payeeVpa || ''))}`);
  // pn is single-encoded so UPI apps decode it once to the display name.
  // Max 50 chars per NPCI.
  params.push(`pn=${encodeURIComponent(String(profile.payeeName || '').trim().substring(0, 50))}`);
  // am is optional: omitted when no amount is provided (LinkPe-style amount-only links).
  if (amountPaise !== null && amountPaise !== undefined && amountPaise !== 0) {
    params.push(`am=${amountToRupees2dp(amountPaise)}`);
  }
  params.push('cu=INR');
  params.push(`tr=${encodeURIComponent(trRef(paymentId))}`);
  // Only merchant-configured transactions carry the extra merchant reference.
  if (profile.mcc && /^\d{4}$/.test(String(profile.mcc))) {
    params.push(`tid=${encodeURIComponent(trRef(paymentId))}`);
  }
  params.push(`tn=${encodeURIComponent(tnNote(note))}`);
  if (checkoutUrl && profile.mcc && /^\d{4}$/.test(String(profile.mcc))) {
    params.push(`url=${encodeURIComponent(String(checkoutUrl))}`);
  }
  // Never invent a merchant category code. `mc` declares a PSP-registered merchant;
  // emitting a fake one for a personal VPA is what gets the intent rejected in-app.
  if (profile.mcc && /^\d{4}$/.test(String(profile.mcc))) {
    params.push(`mc=${encodeURIComponent(String(profile.mcc))}`);
  }
  if (profile.mcc && /^\d{4}$/.test(String(profile.mcc))) params.push('mode=02');
  if (profile.orgid) {
    params.push(`orgid=${encodeURIComponent(String(profile.orgid))}`);
  }

  let query = params.join('&');
  let signed = false;

  if (profile.intentSignKeyPem) {
    try {
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(Buffer.from(query, 'utf8'));
      signer.end();
      const signature = signer.sign(profile.intentSignKeyPem, 'base64');
      query += `&sign=${encodeURIComponent(signature)}`;
      signed = true;
    } catch (err) {
      // Never fail the payment because of a signing error.
      console.warn('[upi-intent-builder] signing failed, emitting unsigned URI:', err.message);
    }
  }

  return { uri: `upi://pay?${query}`, signed };
}

/**
 * Parameters that are valid on a payment *request* to a personal (P2P) UPI ID.
 *
 * `mc`, `tid`, `url`, `orgid`, `mode`, `sign`, `mid` and `mam` all describe a
 * transaction a PSP has registered on behalf of a merchant. A personal VPA has no
 * such registration, so GPay/PhonePe accept the intent, show the payee and then
 * fail the payment. The identical URI scanned as a QR succeeds because the scanner
 * path does not apply those merchant declarations.
 */
const P2P_INTENT_KEYS = Object.freeze(['pa', 'pn', 'am', 'cu', 'tr', 'tn']);

/**
 * Reduce a canonical query to the P2P-safe parameter set.
 * Values are re-encoded with encodeURIComponent, which emits %20 for spaces —
 * Android's intent parser decodes percent escapes but not the form-encoded '+'
 * that URLSearchParams.toString() produces (a name would arrive as "Demo+Store").
 * @param {string} query
 * @returns {string}
 */
function toP2pQuery(query) {
  const source = new URLSearchParams(query);
  const parts = [];
  for (const key of P2P_INTENT_KEYS) {
    const value = source.get(key);
    if (value !== null && value !== '') parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}

/**
 * Wrap a canonical upi://pay URI into an Android package-specific intent URI.
 *
 * A PSP-registered merchant URI carries `sign=` over its full parameter set and
 * must be passed through untouched. Every other URI is a personal VPA: it is
 * reduced to the P2P-safe parameters so the payment app does not reject it as an
 * unregistered merchant transaction.
 *
 * @param {string} uri - upi://pay URI
 * @param {string} pkg - Android package name (e.g. com.google.android.apps.nbu.paisa.user)
 * @param {string} [fallbackUrl] - Chrome fallback for unhandled app launch; NOT a payment callback
 * @returns {string}
 */
export function buildPackageIntent(uri, pkg, fallbackUrl = null) {
  const rawQuery = uri.split('?')[1] || '';
  const query = /(?:^|&)sign=/.test(rawQuery) ? rawQuery : toP2pQuery(rawQuery);
  let intentUri = `intent://pay?${query}#Intent;scheme=upi;package=${pkg}`;

  // Chrome browser fallback does not carry a transaction result.
  if (fallbackUrl) {
    intentUri += `;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`;
  }

  intentUri += ';end';
  return intentUri;
}

/**
 * Build all four package-targeted intent URIs from a canonical UPI URI.
 * @param {string} uri - upi://pay URI
 * @param {string} [fallbackUrl] - S.browser_fallback_url (MANDATORY for GPay/PhonePe callbacks)
 * @returns {{ gpay: string, phonepe: string, paytm: string, bhim: string }}
 */
export function buildPackageIntents(uri, fallbackUrl = null) {
  return {
    gpay: buildPackageIntent(uri, UPI_PACKAGES.gpay, fallbackUrl),
    phonepe: buildPackageIntent(uri, UPI_PACKAGES.phonepe, fallbackUrl),
    paytm: buildPackageIntent(uri, UPI_PACKAGES.paytm, fallbackUrl),
    bhim: buildPackageIntent(uri, UPI_PACKAGES.bhim, fallbackUrl)
  };
}
