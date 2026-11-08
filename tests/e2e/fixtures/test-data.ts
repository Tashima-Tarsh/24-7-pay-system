import crypto from 'node:crypto';

/** Test merchant fixture with webhook URL and secret. */
export const TEST_MERCHANT = {
  merchantId: 'e2e_merchant_001',
  businessName: 'E2E Test Store',
  slug: 'e2e-test-store',
  email: 'e2e@teststore.com',
  phone: '9876543210',
  webhookUrl: 'http://localhost:9999/webhook/e2e',
  webhookSecret: 'whsec_e2e_test_secret_0123456789abcdef',
};

/** Payment order fixtures. */
export const PAYMENT_FIXTURES = {
  success: {
    orderId: 'ORD-E2E-SUCCESS-001',
    amount: '499.00',
    amountPaise: 49900,
    currency: 'INR',
    expectedStatus: 'SUCCESS',
  },
  failure: {
    orderId: 'ORD-E2E-FAILURE-001',
    amount: '299.00',
    amountPaise: 29900,
    currency: 'INR',
    expectedStatus: 'FAILED',
  },
  expired: {
    orderId: 'ORD-E2E-EXPIRED-001',
    amount: '199.00',
    amountPaise: 19900,
    currency: 'INR',
    expectedStatus: 'EXPIRED',
  },
};

/** Mock UTR values (12 digits). */
export const MOCK_UTRS = {
  valid: '123456789012',
  duplicate: '123456789012',
  invalidShort: '12345',
  invalidAlpha: 'ABCDEFGHIJKL',
  success: '987654321012',
  failure: '111111111111',
};

/** Generate a valid and invalid HMAC signature pair. */
export function generateHmacTestPair(payload, secret) {
  const valid = crypto.createHmac('sha256', secret).update(JSON.stringify(payload), 'utf8').digest('hex');
  const invalid = crypto.createHmac('sha256', 'wrong_secret_0000000000').update(JSON.stringify(payload), 'utf8').digest('hex');
  return { valid, invalid, secret };
}

/** Expected ledger double-entry for a successful collection. */
export function expectedLedgerEntries(merchantId, paymentId, amountPaise) {
  return [
    { accountCode: 'PROVIDER_CLEARING', direction: 'DEBIT', amountPaise },
    { accountCode: 'MERCHANT_RECEIVABLES', direction: 'CREDIT', amountPaise },
  ];
}
