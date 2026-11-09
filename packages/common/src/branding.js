/**
 * 24/7 Pay — Central Product Branding & Configuration
 * Authoritative constants for the 24/7 Pay platform.
 */

export const PRODUCT_NAME = '24/7 Pay';
export const PRODUCT_SLUG = '24-7-pay';
export const APP_ID = '24-7-pay';
export const DASHBOARD_TITLE = '24/7 Pay Merchant Workspace';
export const CHECKOUT_TITLE = '24/7 Pay Secure Checkout';
export const API_DISPLAY_NAME = '24/7 Pay API';
export const RECEIPT_BRAND = '24/7 Pay';

export const SanbookPayConfig = Object.freeze({
  productName: PRODUCT_NAME,
  slug: PRODUCT_SLUG,
  appId: APP_ID,
  dashboardTitle: DASHBOARD_TITLE,
  checkoutTitle: CHECKOUT_TITLE,
  apiDisplayName: API_DISPLAY_NAME,
  receiptBrand: RECEIPT_BRAND,
  defaultSupportEmail: process.env.SUPPORT_EMAIL || null,
  defaultPrimaryColor: process.env.DEFAULT_PRIMARY_COLOR || '#059669', // Emerald accent
  darkNavyBg: '#0f172a',
  whiteBg: '#ffffff',
  headerTheme: 'dark',
  customDomain: process.env.PAY_PUBLIC_DOMAIN || process.env.YOUPI_DOMAIN || null,
  companyName: process.env.COMPANY_NAME || '24/7 Pay',
  logoUrl: process.env.DEFAULT_LOGO_URL || null,
  version: '2.0.0-production'
});

export const DefaultBranding = Object.freeze({
  appName: PRODUCT_NAME,
  primaryColor: SanbookPayConfig.defaultPrimaryColor,
  logoUrl: null
});

// Legacy backward-compatibility alias
export const LegacyDefaultBranding = Object.freeze({
  appName: 'YOUPI PG',
  primaryColor: '#2563eb',
  logoUrl: null
});

