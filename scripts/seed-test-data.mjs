import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const dbPath = process.env.SQLITE_DB_PATH || path.join(rootDir, 'data', 'youpi_pg.sqlite');

import {
  Database,
  MerchantRepository,
  ReceivingAccountRepository,
  PaymentSessionRepository
} from '@youpi/db';

const ORDER_ID = `TEST_ORDER_${Date.now()}`;
const SLUG = `test-store-${Date.now()}`;
const AMOUNT_PAISE = 10000;
const UPI_ID = 'testmerchant@upi';
const PAYEE_NAME = 'Test Merchant';

async function seed() {
  const db = new Database({ dbPath, autoMigrate: true });

  try {
    const merchantRepo = new MerchantRepository(db);
    const accountRepo = new ReceivingAccountRepository(db);
    const sessionRepo = new PaymentSessionRepository(db);

    // 1. Create test merchant
    const merchant = merchantRepo.create({
      businessName: 'Test Store',
      slug: SLUG,
      contactEmail: 'test@test.com',
      contactPhone: '+919999999999',
      webhookSecret: crypto.randomBytes(32).toString('hex'),
      branding: { primaryColor: '#0A0E27', appName: 'YOUPI PG Test', logoUrl: null }
    });
    console.log(`[SEED] Merchant: ${merchant.businessName} (${merchant.id})`);

    // 2. Create active receiving account (VPA)
    const account = accountRepo.create({
      merchantId: merchant.id,
      upiId: UPI_ID,
      payeeName: PAYEE_NAME,
      isActive: true,
      isMerchantEnabled: true
    });
    console.log(`[SEED] Receiving Account: ${account.upiId} (${account.id})`);

    // 3. Create checkout session (INITIATED, then set ACTIVE + expiresAt)
    const session = sessionRepo.create({
      merchantId: merchant.id,
      receivingAccountId: account.id,
      orderId: ORDER_ID,
      amountPaise: AMOUNT_PAISE,
      currency: 'INR',
      method: 'UPI',
      status: 'ACTIVE'
    });

    // set expiresAt (15 min from now) — create() SQL does not include expires_at column
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.execute(
      `UPDATE payment_sessions SET expires_at = ?, updated_at = ? WHERE id = ?`,
      [expiresAt, new Date().toISOString(), session.id]
    );

    console.log(`[SEED] Checkout Session: orderId=${session.orderId} sessionId=${session.id} status=${session.status}`);

    console.log('\n✅ SEED SUCCESSFUL!');
    console.log(`📋 Order ID: ${ORDER_ID}`);
    console.log(`🆔 Session ID (UUID): ${session.id}`);
    console.log(`🔗 Checkout URL: http://localhost:7000/checkout/${ORDER_ID}`);
    console.log(`🔗 API State URL: http://localhost:7000/api/v1/checkout/${session.id}/state`);
    console.log(`💰 Amount: ₹${(AMOUNT_PAISE / 100).toFixed(2)}`);
    console.log(`🏦 Payee VPA: ${UPI_ID}`);
    console.log(`\nExport the Session UUID for the E2E test (API looks up by session UUID, not order ID):`);
    console.log(`  export TEST_ORDER_ID=${session.id}`);
  } finally {
    db.close();
  }
}

seed().catch(err => {
  console.error('[SEED] Failed:', err);
  process.exit(1);
});
