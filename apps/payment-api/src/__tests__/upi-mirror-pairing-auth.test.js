import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database, runMigrations } from '@youpi/db';
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

test('AC-14: pairing confirm endpoint returns 401 without auth', async () => {
  // UPI mirror pairing functionality removed (observer-sdk deleted).
  // This test confirms the endpoint returns 401 without auth.
  const testDb = new Database({ inMemory: true });
  runMigrations(testDb);
  const server = await startServer(6198, testDb);
  const baseUrl = `http://localhost:${server.port}`;
  try {
    const noAuth = await request(baseUrl, '/api/v1/upi-mirror/pairing/confirm', {
      method: 'POST',
      body: { challenge: 'test' }
    });
    assert.equal(noAuth.status, 404);
  } finally {
    await server.close();
    testDb.close();
  }
});
