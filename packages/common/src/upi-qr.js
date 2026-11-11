/**
 * NPCI-compliant UPI QR Code and Deep Link Generator.
 * Works with ALL UPI apps (Google Pay, PhonePe, Paytm, BHIM, etc.)
 * ZERO merchant account or bank approval required — just need a VPA.
 * All features are 100% free (Government of India mandates 0% MDR on UPI since 2020).
 */
import { generateQrSvg } from '@youpi/core';
import { normalizePayeeName, toP2pIntentQuery } from './upi.js';

/**
 * Builds a standard NPCI UPI payment URI.
 * Format: upi://pay?pa={vpa}&pn={name}&mc={merchantCode}&mode={mode}&tr={txnRef}&tn={note}&am={amount}&cu=INR
 *
 * @param {Object} params
 * @param {string} params.vpa - Payee VPA (e.g. merchant@upi)
 * @param {string} params.name - Payee name (max 100 chars)
 * @param {number} [params.amount] - Fixed amount in rupees (omitted = user enters amount)
 * @param {string} [params.orderId] - Transaction reference ID
 * @param {string} [params.note] - Transaction note/description
 * @param {'fixed'|'editable'} [params.mode='fixed'] - 'fixed' locks amount, 'editable' lets user change
 * @param {string} [params.merchantCode] - Merchant category code (optional)
 * @returns {string} UPI payment URI (e.g. upi://pay?pa=merchant@upi&pn=Store&mode=04&am=100.00&cu=INR&tr=ORD123)
 */
export function buildUpiPaymentUri({ vpa, name, amount, orderId, note = '', mode = 'fixed', merchantCode = '' }) {
  if (!vpa || typeof vpa !== 'string') throw new Error('VPA is required');
  if (!name || typeof name !== 'string') throw new Error('Payee name is required');

  const params = new URLSearchParams();
  params.set('pa', vpa.trim());
  // Sanitize payee name: NFC-normalized, capped at 50 chars. URLSearchParams handles encoding.
  const safeName = normalizePayeeName(name);
  params.set('pn', safeName);
  // A personal P2P VPA must not receive merchant-only request hints.
  // Retain the existing merchant-specific fields only for an explicit MCC.
  const hasMerchantCode = /^\d{4}$/.test(String(merchantCode || ''));
  if (hasMerchantCode) {
    params.set('mc', String(merchantCode).trim());
    params.set('mode', mode === 'fixed' ? '04' : '02');
  }
  if (orderId) {
    const safeRef = String(orderId).replace(/[^a-zA-Z0-9]/g, '').substring(0, 35);
    params.set('tr', safeRef);
    if (hasMerchantCode) params.set('tid', safeRef);
  }
  if (note) {
    const safeNote = String(note)
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .substring(0, 30);
    if (safeNote) params.set('tn', safeNote);
  }
  if (amount !== undefined && amount !== null) {
    params.set('am', Number(amount).toFixed(2));
  }
  params.set('cu', 'INR');

  return `upi://pay?${params.toString()}`;
}

/**
 * Builds app-specific UPI deep links from a UPI URI.
 * These links open the payment directly in the respective UPI app.
 *
 * The handoff uses the P2P-safe parameter set. A merchant VPA is fine too, because the
 * P2P-safe set is a strict subset: `pa`, `pn`, `am`, `cu`, `tr`, `tn`. Declaring `mc`,
 * `tid` or `url` for a personal UPI ID is what makes GPay/PhonePe open the app, show the
 * payee and then fail the payment ("payment failed", "receiver's account is inactive",
 * "exceeds the limit set by your bank"). The QR keeps its full payload because scanning
 * does not apply the merchant checks; the intent must not claim to be a merchant.
 *
 * @param {string} upiUri - Full upi://pay URI from buildUpiPaymentUri()
 * @param {string} [fallbackUrl] - Chrome fallback if the target app cannot be launched.
 *                                 This is NOT a payment-status callback.
 * @returns {Object} Map of app name → deep link URL
 */
export function buildUpiPaymentIntentLinks(upiUri, fallbackUrl = null) {
  if (!upiUri || !upiUri.startsWith('upi://pay?')) throw new Error('Invalid UPI URI');

  // Fallback URL is MANDATORY — use env var PUBLIC_CHECKOUT_URL as production fallback
  // so UPI apps redirect to the public domain (not localhost) after payment.
  const resolvedFallback = fallbackUrl || process.env.PUBLIC_CHECKOUT_URL || null;

  // Production guard: refuse to emit intent links without a valid HTTPS fallback
  if (process.env.NODE_ENV === 'production') {
    if (!resolvedFallback || /localhost|127\.0\.0\.1/i.test(resolvedFallback) || !resolvedFallback.startsWith('https://')) {
      throw new Error('PUBLIC_CHECKOUT_URL must be set to the production HTTPS origin in production');
    }
  }

  const query = toP2pIntentQuery(upiUri);
  const intentBase = `intent://pay?${query}#Intent;scheme=upi;`;
  const p2pUri = `upi://pay?${query}`;

  const links = {
    phonepe: `${intentBase}package=com.phonepe.app;end`,
    gpay: `${intentBase}package=com.google.android.apps.nbu.paisa.user;end`,
    paytm: `${intentBase}package=net.one97.paytm;end`,
    bhim: p2pUri, // BHIM uses upi:// directly
    upi: p2pUri // Generic fallback
  };

  // Chrome's browser_fallback_url is for an unsuccessful app launch,
  // not confirmation of payment success or failure.
  if (resolvedFallback) {
    const encodedFallback = encodeURIComponent(resolvedFallback);
    for (const app of ['phonepe', 'gpay', 'paytm']) {
      links[app] = links[app].replace(';end', `;S.browser_fallback_url=${encodedFallback};end`);
    }
  }

  return links;
}

/**
 * Generates a base64 data URI SVG QR code from a UPI URI.
 * Can be embedded directly in <img src="data:image/svg+xml;base64,..." />.
 *
 * @param {string} upiUri - UPI payment URI
 * @param {number} [boxSize=400] - SVG size in pixels
 * @returns {string} data:image/svg+xml;base64,... data URI
 */
export function generateQrDataUri(upiUri, boxSize = 400) {
  if (!upiUri) throw new Error('UPI URI is required');
  const svg = generateQrSvg(upiUri, boxSize, 'M');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Converts rupees to integer paise (avoids JS float bugs like 5.99 * 100 = 599.0000000000001).
 *
 * @param {number|string} rupees
 * @returns {number} Integer paise
 */
export function rupeesToPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

/**
 * Converts integer paise to rupees string with 2 decimal places.
 *
 * @param {number|string} paise
 * @returns {string} Rupees string (e.g. '100.00')
 */
export function paiseToRupees(paise) {
  return (Number(paise) / 100).toFixed(2);
}
