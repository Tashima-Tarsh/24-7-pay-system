import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database, runMigrations, MerchantRepository, DevicePairingChallengeRepository } from '@youpi/db';
import { startServer } from '../index.js';

process.env.ADMIN_API_TOKEN = 'test-admin-token-0123456789abcdef0123456789abcdef';

function request(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    };
    const req = http.request(url, reqOpts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

test('AC-14: pairing confirm without merchant auth -> 401; with admin bearer -> not 401', async () => {
  const testDb = new Database({ inMemory: true });
  runMigrations(testDb);
  const merchantRepo = new MerchantRepository(testDb);
  const pairingRepo = new DevicePairingChallengeRepository(testDb);
  const merchant = merchantRepo.findAll()[0];
  assert.ok(merchant, 'seeded demo merchant');

  const challenge = pairingRepo.create({
    merchantId: merchant.id,
    challenge: 'pair-challenge-test',
    qrPayload: 'qr-payload-test',
    status: 'PENDING'
  });

  const server = await startServer(6198, testDb);
  const baseUrl = `http://localhost:${server.port}`;
  try {
    // No merchant auth -> 401
    const noAuth = await request(baseUrl, '/api/v1/upi-mirror/pairing/confirm', {
      method: 'POST',
      body: {
        pairingId: challenge.id,
        deviceId: 'device-1',
        publicKey: 'pubkey',
        fingerprintHash: 'fphash',
        deviceTokenHash: 'dthash'
      }
    });
    assert.equal(noAuth.status, 401, 'pairing confirm must require merchant auth');
    assert.equal(noAuth.body.code, 'AUTH_REQUIRED');

    // Admin bearer token -> not 401 (proceeds past auth gate)
    const withAuth = await request(baseUrl, '/api/v1/upi-mirror/pairing/confirm', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-admin-token-0123456789abcdef0123456789abcdef' },
      body: {
        pairingId: challenge.id,
        deviceId: 'device-2',
        publicKey: 'pubkey',
        fingerprintHash: 'fphash',
        deviceTokenHash: 'dthash'
      }
    });
    assert.notEqual(withAuth.status, 401, 'merchant auth must pass the gate');

  } finally {
    await server.close();
    testDb.close();
  }
});
