import crypto from 'node:crypto';

/**
 * UPI intent URI builder.
 *
 * Builds a canonical upi://pay query with parameters in a fixed order:
 *   pa, pn, am (2dp), cu=INR, tr, tn, mc, mode=02, orgid (only if set)
 * All values are URL-encoded. Optionally appends `sign=` (RSA-SHA256 over the
 * query bytes, base64, URL-encoded) when the profile carries a signing key.
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
 * Strip & % # + and truncate to 50 chars (transaction note).
 * @param {string} value
 * @returns {string}
 */
function tnNote(value) {
  return String(value).replace(/[&%#+\s]/g, '').slice(0, 50);
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
  // pn is double-encoded so UPI apps decode it once to the display name.
  params.push(`pn=${encodeURIComponent(encodeURIComponent(String(profile.payeeName || '')))}`);
  params.push(`am=${amountToRupees2dp(amountPaise)}`);
  params.push('cu=INR');
  params.push(`tr=${encodeURIComponent(trRef(paymentId))}`);
  params.push(`tn=${encodeURIComponent(tnNote(note))}`);
  if (checkoutUrl) {
    params.push(`url=${encodeURIComponent(String(checkoutUrl))}`);
  }
  params.push(`mc=${encodeURIComponent(String(profile.mcc || '5411'))}`);
  params.push('mode=02');
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
 * Wrap a canonical upi://pay URI into an Android package-specific intent URI.
 * @param {string} uri
 * @param {string} pkg
 * @returns {string}
 */
export function buildPackageIntent(uri, pkg) {
  const query = uri.split('?')[1] || '';
  return `intent://pay?${query}#Intent;scheme=upi;package=${pkg};end`;
}

/**
 * Build all four package-targeted intent URIs from a canonical UPI URI.
 * @param {string} uri
 * @returns {{ gpay: string, phonepe: string, paytm: string, bhim: string }}
 */
export function buildPackageIntents(uri) {
  return {
    gpay: buildPackageIntent(uri, UPI_PACKAGES.gpay),
    phonepe: buildPackageIntent(uri, UPI_PACKAGES.phonepe),
    paytm: buildPackageIntent(uri, UPI_PACKAGES.paytm),
    bhim: buildPackageIntent(uri, UPI_PACKAGES.bhim)
  };
}
