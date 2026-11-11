import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpiUri as buildCoreUpi, buildPackageIntents } from '../upi-intent-builder.js';
import { buildUpiPaymentUri, buildUpiPaymentIntentLinks } from '../../../common/src/upi-qr.js';
import { buildUpiUri as buildCommonUpi, buildUpiIntentUri, toP2pIntentUri } from '../../../common/src/upi.js';

const vpa = 'person@okaxis';
const name = 'Personal Payee';
const amountPaise = 1000n;
const ref = 'TEST100';

function personalParameters(uri) {
  assert.match(uri, /^upi:\/\/pay\?/);
  const q = new URL(uri).searchParams;
  assert.equal(q.get('pa'), vpa);
  assert.equal(q.get('pn'), name);
  assert.equal(q.get('am'), '10.00');
  assert.equal(q.get('cu'), 'INR');
  for (const field of ['mc', 'tid', 'mode', 'orgid', 'url', 'mid', 'sign']) {
    assert.equal(q.has(field), false, 'Unexpected P2P field: ' + field);
  }
}

test('all P2P URI builders omit merchant-only fields', () => {
  const common = buildCommonUpi({ payeeVpa: vpa, payeeName: name, amountPaise, transactionRef: ref, transactionNote: 'Payment' });
  const qr = buildUpiPaymentUri({ vpa, name, amount: 10, orderId: ref, note: 'Payment', mode: 'fixed' });
  const core = buildCoreUpi({payeeVpa:vpa,payeeName:name}, amountPaise, ref, 'Payment', 'https://pay.example/checkout/TEST100').uri;
  [common, qr, core].forEach(personalParameters);
  assert.deepEqual(Object.fromEntries(new URL(common).searchParams), Object.fromEntries(new URL(qr).searchParams));
  assert.deepEqual(Object.fromEntries(new URL(common).searchParams), Object.fromEntries(new URL(core).searchParams));
});

test('QR UPI payment data and app links agree on all P2P fields', () => {
  const qr = buildUpiPaymentUri({ vpa, name, amount: 10, orderId: ref, note: 'Payment' });
  const links = buildUpiPaymentIntentLinks(qr, 'https://pay.example/checkout/TEST100');
  const coreLinks = buildPackageIntents(qr, 'https://pay.example/checkout/TEST100');
  const canonical = toP2pIntentUri(qr).split('?')[1];
  for (const link of [...Object.values(coreLinks), links.gpay, links.phonepe]) {
    assert.equal(link.slice('intent://pay?'.length, link.indexOf('#Intent;')), canonical);
  }
  assert.equal(links.upi, 'upi://pay?' + canonical);
});

test('common Android intent for P2P is not encoded as a merchant request', () => {
  const android = buildUpiIntentUri({ payeeVpa:vpa, payeeName:name, amountPaise, transactionRef:ref, transactionNote:'Payment', targetApp:'gpay', checkoutUrl:'https://pay.example/checkout/TEST100'});
  assert.match(android, /^intent:\/\/pay\?/);
  for (const field of ['tid','mc','mode','url']) assert.equal(new URLSearchParams(android.slice('intent://pay?'.length,android.indexOf('#Intent;'))).has(field),false);
});
