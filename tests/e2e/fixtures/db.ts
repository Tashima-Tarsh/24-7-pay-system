import Database from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const REPO_ROOT = path.resolve(process.cwd(), '../..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'youpi_pg.sqlite');
const SCHEMA_PATH = path.join(REPO_ROOT, 'packages', 'db', 'src', 'sqlite-schema.sql');

let _db = null;

export function ensureDbDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb() {
  if (!_db) {
    ensureDbDir();
    _db = new Database.DatabaseSync(DB_PATH);
    _db.exec('PRAGMA foreign_keys = ON;');
    _db.exec('PRAGMA busy_timeout = 5000;');
    _db.exec('PRAGMA journal_mode = WAL;');
    initializeSchema(_db);
  }
  return _db;
}

function initializeSchema(db: any) {
  // Always run the idempotent schema (CREATE TABLE IF NOT EXISTS)
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);
  // Run the UPI mirror migration
  const migrationPath = path.join(REPO_ROOT, 'packages', 'db', 'src', 'migrations', '001-upi-mirror.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  db.exec(migrationSql);
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Reset all financial tables to a clean state for deterministic tests. */
export function resetDb() {
  const db = getDb();
  const tables = [
    'ledger_entries',
    'ledger_transactions',
    'ledger_accounts',
    'webhook_deliveries',
    'webhook_endpoints',
    'notification_deliveries',
    'payment_receipts',
    'audit_logs',
    'security_events',
    'payment_observations',
    'payment_sessions',
    'customers',
    'payment_receiving_accounts',
    'merchants',
    'provider_payment_claims',
    'provider_webhook_deliveries',
  ];
  db.exec('BEGIN IMMEDIATE;');
  for (const t of tables) {
    try { db.exec(`DELETE FROM ${t}`); } catch {}
  }
  db.exec('COMMIT;');
}

/** Insert a test merchant with webhook config. Returns the inserted row. */
export function createTestMerchant(overrides = {}) {
  const db = getDb();
  const id = overrides.merchantId || 'test_merchant_001';
  const webhookSecret = overrides.webhookSecret || 'whsec_test_1234567890abcdef';
  const webhookUrl = overrides.webhookUrl || 'http://localhost:9999/webhook';
  const now = new Date().toISOString();
  const branding = JSON.stringify({
    appName: 'Test Merchant',
    primaryColor: '#2563eb',
    webhookUrl,
    webhookSecret,
    paymentRules: [],
  });
  db.exec(`BEGIN IMMEDIATE;`);
  db.prepare(
    `INSERT OR REPLACE INTO merchants
       (id, business_name, slug, contact_email, contact_phone, webhook_url, webhook_secret, branding, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    overrides.businessName || 'Test Merchant E2E',
    'test-merchant-e2e',
    overrides.email || 'merchant@test.com',
    overrides.phone || '9876543210',
    webhookUrl,
    webhookSecret,
    branding,
    now,
    now
  );
  db.exec('COMMIT;');
  return db.prepare('SELECT * FROM merchants WHERE id = ?').get(id);
}

/** Insert a test receiving account (UPI VPA) for a merchant. Returns the inserted row. */
export function createReceivingAccount(merchantId, overrides = {}) {
  const db = getDb();
  const id = overrides.id || 'ra_test_001';
  const upiId = overrides.upiId || 'merchant@upi';
  const payeeName = overrides.payeeName || 'Test Merchant';
  const now = new Date().toISOString();
  db.exec(`BEGIN IMMEDIATE;`);
  db.prepare(
    `INSERT OR REPLACE INTO payment_receiving_accounts
       (id, merchant_id, upi_id, payee_name, is_merchant_enabled, is_active, is_slot_busy,
        current_active_session_id, daily_volume_paise, daily_txn_count, rotation_threshold_paise, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, 0, NULL, 0, 0, 9000000, ?, ?)`
  ).run(id, merchantId, upiId, payeeName, now, now);
  db.exec('COMMIT;');
  return db.prepare('SELECT * FROM payment_receiving_accounts WHERE id = ?').get(id);
}

/** Insert a test customer. Returns the inserted row. */
export function createTestCustomer(overrides = {}) {
  const db = getDb();
  const id = overrides.customerId || 'cust_test_001';
  const now = new Date().toISOString();
  db.exec(`BEGIN IMMEDIATE;`);
  db.prepare(
    `INSERT OR REPLACE INTO customers
       (id, name, email, mobile_number, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
  ).run(id, overrides.name || 'Test Customer', overrides.email || 'customer@test.com',
    overrides.phone || '9123456780', now, now);
  db.exec('COMMIT;');
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

/** Insert a payment session directly (bypasses API). Returns the session. */
export function createPaymentSession(merchantId, overrides = {}) {
  const db = getDb();
  const id = overrides.paymentId || `pay_test_${Date.now()}`;
  const orderId = overrides.orderId || `ORD-E2E-${Date.now()}`;
  const amountPaise = overrides.amountPaise || 49900;
  const now = new Date().toISOString();
  const status = overrides.status || 'ACTIVE';
  const expiresAt = overrides.expiresAt || new Date(Date.now() + 300000).toISOString();
  const metadata = JSON.stringify({
    ...(overrides.metadata || {}),
    baseAmountPaise: amountPaise,
    paiseOffset: 0,
    receivingAccountSnapshot: overrides.receivingAccountSnapshot || {
      id: 'ra_test_001',
      upiId: 'merchant@upi',
      payeeName: 'Test Merchant',
      isMerchantEnabled: true,
      isTestOverride: false,
    },
  });
  db.exec(`BEGIN IMMEDIATE;`);
  db.prepare(
    `INSERT OR REPLACE INTO payment_sessions
       (id, merchant_id, customer_id, receiving_account_id, order_id, amount_paise, paise_offset,
        base_amount_paise, currency, method, status, queue_position, slot_acquired_at, expires_at,
        processing_started_at, processing_expires_at, completed_at, return_url,
        attributed_observation_id, idempotency_key, device_id, verification_level,
        verification_sources, verification_tag, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'INR', 'UPI', ?, 0, NULL, ?, NULL, NULL, NULL, ?,
        NULL, NULL, NULL, 0, '[]', 'UNVERIFIED', ?, ?, ?)`
  ).run(
    id,
    merchantId,
    overrides.customerId || null,
    overrides.receivingAccountId || 'ra_test_001',
    orderId,
    amountPaise,
    amountPaise,
    status,
    expiresAt,
    overrides.returnUrl || null,
    metadata,
    now,
    now
  );
  db.exec('COMMIT;');
  return db.prepare('SELECT * FROM payment_sessions WHERE id = ?').get(id);
}

/** Insert a payment observation (simulates SMS/Gmail listener detection). */
export function insertObservation(merchantId, receivingAccountId, overrides = {}) {
  const db = getDb();
  const id = overrides.id || `obs_${Date.now()}`;
  const now = new Date().toISOString();
  const amountPaise = overrides.amountPaise || 49900;
  const bankReference = overrides.bankReference || `UTR${Date.now().toString().slice(-12)}`;
  const fingerprint = overrides.fingerprint || `fp_${id}`;
  db.exec(`BEGIN IMMEDIATE;`);
  db.prepare(
    `INSERT OR REPLACE INTO payment_observations
       (id, receiving_account_id, source, amount_paise, observed_at, ingested_at,
        sender_vpa, bank_reference_number, fingerprint_hash, raw_payload,
        attribution_status, attributed_payment_id, created_at)
     VALUES (?, ?, 'SMS_GATEWAY', ?, ?, ?, '9876543210@upi', ?, ?, '{}',
        'UNATTRIBUTED', NULL, ?)`
  ).run(id, receivingAccountId, amountPaise, now, now, bankReference, fingerprint, now);
  db.exec('COMMIT;');
  return db.prepare('SELECT * FROM payment_observations WHERE id = ?').get(id);
}

/** Query ledger entries for a payment order. */
export function getLedgerEntriesForOrder(referenceId) {
  const db = getDb();
  return db.prepare(
    `SELECT le.*, la.account_code, la.account_name, la.account_type
     FROM ledger_entries le
     JOIN ledger_transactions lt ON le.transaction_id = lt.id
     JOIN ledger_accounts la ON le.account_id = la.id
     WHERE lt.reference_id = ?
     ORDER BY le.created_at`
  ).all(referenceId);
}

/** Query the payment session by ID. */
export function getPaymentSession(paymentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM payment_sessions WHERE id = ?').get(paymentId);
}

/** Query webhook deliveries for a payment. */
export function getWebhookDeliveries(paymentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM webhook_deliveries WHERE payment_id = ? ORDER BY created_at').all(paymentId);
}

/** Query audit log entries for a payment session. */
export function getAuditLogs(entityId) {
  const db = getDb();
  return db.prepare('SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY created_at').all(entityId);
}

/** Insert ledger accounts needed for double-entry assertions. */
export function ensureLedgerAccounts(merchantId) {
  const db = getDb();
  const now = new Date().toISOString();
  const accounts = [
    { id: 'la_prov_clearing', accountCode: 'PROVIDER_CLEARING', accountName: 'Provider Clearing', accountType: 'ASSET' },
    { id: 'la_merch_receivable', accountCode: 'MERCHANT_RECEIVABLES', accountName: 'Merchant Receivables', accountType: 'ASSET' },
  ];
  db.exec(`BEGIN IMMEDIATE;`);
  for (const acc of accounts) {
    db.prepare(
      `INSERT OR IGNORE INTO ledger_accounts (id, merchant_id, account_code, account_name, account_type, currency, balance_paise, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'INR', 0, ?, ?)`
    ).run(acc.id, merchantId, acc.accountCode, acc.accountName, acc.accountType, now, now);
  }
  db.exec('COMMIT;');
}
