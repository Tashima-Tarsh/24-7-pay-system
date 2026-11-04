import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database, runMigrations, PaymentSessionRepository, ObservationRepository } from '@youpi/db';
import { TimingEngine } from '../timing-engine.js';
import { AttributionEngine, ObservationNormalizer } from '../index.js';
import { PaymentStatus } from '@youpi/common';
import { GmailService } from '../gmail-service.js';

const MERCHANT = '00000000-0000-0000-0000-000000000001';
const ACCOUNT = '00000000-0000-0000-0000-000000000002';

function newEngine(db) {
  const sessions = new PaymentSessionRepository(db);
  const observations = new ObservationRepository(db);
  const events = [];
  const timing = new TimingEngine({
    sessionRepo: sessions,
    queueEngine: { promoteNext: () => {} },
    eventEmitter: { emit: (name) => events.push(name) },
    auditRepo: { log: () => {} },
    verificationDurationMs: 1800000
  });
  const engine = new AttributionEngine({
    sessionRepo: sessions,
    obsRepo: observations,
    eventEmitter: { emit: (name) => events.push(name) },
    gracePeriodMs: 0
  });
  return { sessions, observations, timing, engine, events };
}

test('AC-7: ACTIVE session past issue TTL with a reported UTR -> VERIFICATION_PENDING, not EXPIRED', () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const { sessions, timing, engine } = newEngine(db);
  const s = sessions.create({ merchantId: MERCHANT, receivingAccountId: ACCOUNT, orderId: 'T7', amountPaise: 400, status: PaymentStatus.ACTIVE, metadata: { reportedUtr: '630414503470' } });
  // Force expires_at into the past
  db.execute('UPDATE payment_sessions SET expires_at = ? WHERE id = ?', [new Date(Date.now() - 1000).toISOString(), s.id]);
  timing.handleActiveTimerExpiration(s.id);
  const updated = sessions.findById(s.id);
  assert.equal(updated.status, PaymentStatus.VERIFICATION_PENDING, 'must not EXPIRE when UTR reported');
  assert.ok(updated.verificationExpiresAt, 'verification window started');
  engine.destroy(); db.close();
});

test('AC-8: VERIFICATION_PENDING past 30 min -> EXPIRED and slot released', () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const { sessions, timing, engine } = newEngine(db);
  const s = sessions.create({ merchantId: MERCHANT, receivingAccountId: ACCOUNT, orderId: 'T8', amountPaise: 400, status: PaymentStatus.VERIFICATION_PENDING, metadata: { reportedUtr: '630414503470' } });
  db.execute('UPDATE payment_sessions SET verification_expires_at = ? WHERE id = ?', [new Date(Date.now() - 1000).toISOString(), s.id]);
  timing.handleVerificationTimerExpiration(s.id);
  const updated = sessions.findById(s.id);
  assert.equal(updated.status, PaymentStatus.EXPIRED, 'must EXPIRE past verification window');
  engine.destroy(); db.close();
});

test('AC-9: email observation with matching UTR -> SUCCESS at level 3, one source enough', () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const { sessions, observations, engine } = newEngine(db);
  const s = sessions.create({ merchantId: MERCHANT, receivingAccountId: ACCOUNT, orderId: 'T9', amountPaise: 400, status: PaymentStatus.VERIFICATION_PENDING, metadata: { reportedUtr: '630414503470' } });
  // Bank observation held unattributed (evidence arrives after the customer reported the UTR).
  observations.create({
    receivingAccountId: ACCOUNT, source: 'GMAIL', amountPaise: 400n,
    bankReferenceNumber: '630414503470', observedAt: new Date(),
    attributionStatus: 'UNATTRIBUTED', fingerprintHash: 'fp-ac9',
    rawPayload: { text: 'INR 4.00 credited. UTR 630414503470' }
  });
  const result = engine.reconcilePendingPayment(s.id);
  assert.equal(result.attributed, true);
  assert.equal(sessions.findById(s.id).status, PaymentStatus.SUCCESS);
  const updated = sessions.findById(s.id);
  assert.equal(updated.verificationLevel, 3);
  assert.equal(updated.verificationTag, 'UTR_VERIFIED');
  assert.ok(Array.isArray(updated.verificationSources) && updated.verificationSources.length === 1);
  engine.destroy(); db.close();
});

test('AC-10: email observation with a different UTR -> stays VERIFICATION_PENDING, never settles', () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const { sessions, engine } = newEngine(db);
  const s = sessions.create({ merchantId: MERCHANT, receivingAccountId: ACCOUNT, orderId: 'T10', amountPaise: 400, status: PaymentStatus.VERIFICATION_PENDING, metadata: { reportedUtr: '630414503470' } });
  const obs = ObservationNormalizer.normalize({
    source: 'GMAIL', receivingAccountId: ACCOUNT, amount: '4.00',
    bankReferenceNumber: '999999999999', observedAt: new Date(),
    rawPayload: { text: 'INR 4.00 credited. UTR 999999999999' }
  });
  const result = engine.processObservation(obs);
  assert.equal(result.attributed, false);
  assert.equal(sessions.findById(s.id).status, PaymentStatus.VERIFICATION_PENDING);
  engine.destroy(); db.close();
});

test('AC-11: amount match with no reported UTR -> PROBABLE, not SUCCESS', () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const { sessions, engine } = newEngine(db);
  const s = sessions.create({ merchantId: MERCHANT, receivingAccountId: ACCOUNT, orderId: 'T11', amountPaise: 400, status: PaymentStatus.ACTIVE });
  const obs = ObservationNormalizer.normalize({
    source: 'GMAIL', receivingAccountId: ACCOUNT, amount: '4.00',
    bankReferenceNumber: null, observedAt: new Date(),
    rawPayload: { text: 'INR 4.00 credited' }
  });
  const classification = engine.classify(obs, s);
  assert.equal(classification, 'PROBABLE');
  assert.equal(sessions.findById(s.id).status, PaymentStatus.ACTIVE);
  engine.destroy(); db.close();
});

test('AC-12: Gmail observer only queries allowlisted bank domains', () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const service = new GmailService(db);
  const query = service.buildBankAlertQuery(['hdfcbank.net', 'icicibank.com']);
  assert.ok(query.includes('from:hdfcbank.net'));
  assert.ok(query.includes('from:icicibank.com'));
  assert.ok(query.includes('newer_than:1d'));
  assert.ok(!query.includes('from:evil.com'));
  // Empty domain list -> no from restriction, only recency
  const empty = service.buildBankAlertQuery([]);
  assert.equal(empty, 'newer_than:1d');
  db.close();
});
