import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpiUri, buildPackageIntent, buildPackageIntents } from '../upi-intent-builder.js';

const baseProfile = {
  payeeVpa: 'merchant@hdfcbank',
  payeeName: 'Merchant Store',
  mcc: '5411'
};

test('AC-1: unsigned builder emits pa, pn, am, cu, tr, tn, mc, mode=02 in order; am is 2dp', () => {
  const { uri } = buildUpiUri(baseProfile, 12345n, 'ORD-001', 'Coffee & cake');
  const query = uri.split('?')[1];
  const keys = query.split('&').map(p => p.split('=')[0]);
  assert.deepEqual(keys, ['pa', 'pn', 'am', 'cu', 'tr', 'tid', 'tn', 'mc', 'mode']);
  assert.equal(query.match(/am=123\.45/)[0], 'am=123.45');
  assert.equal(query.includes('cu=INR'), true);
  assert.equal(query.includes('mode=02'), true);
  assert.equal(query.includes('sign='), false);
});

test('AC-1: bigint and number paise both render 2dp am via integer math', () => {
  const a = buildUpiUri(baseProfile, 100n, 'x', 'n').uri;
  const b = buildUpiUri(baseProfile, 100, 'x', 'n').uri;
  assert.equal(a.match(/am=1\.00/)[0], 'am=1.00');
  assert.equal(b.match(/am=1\.00/)[0], 'am=1.00');
  const c = buildUpiUri(baseProfile, 1050n, 'x', 'n').uri;
  assert.equal(c.match(/am=10\.50/)[0], 'am=10.50');
});

test('AC-2: signed profile appends sign= last and it verifies with the public key', async () => {
  const { generateKeyPairSync, createSign, createVerify } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 512,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const signedProfile = { ...baseProfile, intentSignKeyPem: privateKey };
  const { uri, signed } = buildUpiUri(signedProfile, 5000n, 'PAY-9', 'note');
  assert.equal(signed, true);
  assert.ok(uri.includes('sign='), 'sign= must be present');
  const signIdx = uri.indexOf('sign=');
  assert.equal(signIdx > uri.indexOf('mode=02'), true, 'sign= appended after mode=02');
  assert.equal(uri.indexOf('&', signIdx), -1, 'sign= is the last parameter');
  const query = uri.split('?')[1];
  const signVal = decodeURIComponent(query.split('sign=')[1]);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(Buffer.from(query.split('&sign=')[0], 'utf8'));
  verifier.end();
  assert.equal(verifier.verify(publicKey, signVal, 'base64'), true);
});

test('AC-2: unsigned profile when signing throws returns unsigned URI and never fails', () => {
  const { uri, signed } = buildUpiUri({ ...baseProfile, intentSignKeyPem: 'not-a-key' }, 5000n, 'PAY-9', 'note');
  assert.equal(signed, false);
  assert.equal(uri.includes('sign='), false);
  assert.equal(uri.startsWith('upi://pay?'), true);
});

test('AC-2 / AC-17: intent contains url= with the checkout URL encoded (before mc)', () => {
  const checkoutUrl = 'http://localhost:7000/checkout/payment-abc';
  const { uri } = buildUpiUri(baseProfile, 5000n, 'PAY-9', 'note', checkoutUrl);
  const query = uri.split('?')[1];
  const keys = query.split('&').map(p => p.split('=')[0]);
  const urlIdx = keys.indexOf('url');
  const mcIdx = keys.indexOf('mc');
  assert.ok(urlIdx >= 0, 'url= must be present');
  assert.equal(urlIdx, mcIdx - 1, 'url= must come immediately before mc');
  assert.ok(query.includes(encodeURIComponent(checkoutUrl)));
});

test('package intents: four packages wrap the canonical URI', () => {
  const { uri } = buildUpiUri(baseProfile, 5000n, 'PAY-9', 'note');
  const intents = buildPackageIntents(uri);
  for (const intent of Object.values(intents)) {
    assert.match(intent, /^intent:\/\/pay\?/);
    assert.doesNotMatch(intent, /[?&](?:mc|tid|url|mode)=/);
    assert.match(intent, /;end$/);
  }
});

test('P2P package intent has exact safe shape, %20 spacing and fallback', () => {
  const uri = 'upi://pay?pa=user%40okaxis&pn=Demo+Store&am=10.00&cu=INR&tr=ORDER1&tid=ORDER1&tn=Order+payment&mc=5411&mode=02&url=https%3A%2F%2Fpay.example';
  const intent = buildPackageIntent(uri, 'com.google.android.apps.nbu.paisa.user', 'https://pay.example/checkout/ORDER1');
  assert.equal(intent, 'intent://pay?pa=user%40okaxis&pn=Demo%20Store&am=10.00&cu=INR&tr=ORDER1&tn=Order%20payment#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;S.browser_fallback_url=https%3A%2F%2Fpay.example%2Fcheckout%2FORDER1;end');
});
