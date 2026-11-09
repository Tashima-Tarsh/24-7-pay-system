import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('hosted HTML has syntactically valid JavaScript',()=>{
  for(const path of ['public/checkout.html','public/admin.html','public/landing.html']){
    const html=fs.readFileSync(path,'utf8');
    for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
      if(match[1].trim()) assert.doesNotThrow(()=>new vm.Script(match[1],{filename:path}));
    }
  }
});
test('checkout fetches full initial state, subscribes to live events, and offers UPI handoff',()=>{
  const c=fs.readFileSync('public/checkout.html','utf8');
  assert.match(c,/void poll\(\);\s*connectSse\(\);/);
  assert.match(c,/eventSource\.addEventListener\('status_change',\s*\(\) => \{ void poll\(\); \}\)/);
  assert.match(c,/id="open-upi"/);
  assert.match(c,/id="upi-app-buttons"/);
  assert.doesNotMatch(c,/api\.qrserver\.com/);
});
test('client app-return never settles funds or sends SUCCESS callbacks',()=>{
  const source=fs.readFileSync('apps/payment-api/src/routes/verify-callback.routes.js','utf8');
  assert.match(source,/verdict: 'VERIFICATION_PENDING'/);
  assert.doesNotMatch(source,/UPDATE payment_sessions SET status = 'SUCCESS'/);
  assert.doesNotMatch(source,/webhookEngine\.dispatch\('PAYMENT.SUCCESS'/);
});
test('public landing page contains no fake settlement figures',()=>{
  const html=fs.readFileSync('public/landing.html','utf8');
  assert.match(html,/24\/7 Pay/);
  assert.doesNotMatch(html,/YOUPI PG|99\.99%|₹2\.4Cr|UPI-2026-0842/);
});
