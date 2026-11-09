import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script=readFileSync(new URL('../public/assets/247-portal.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/247-brand.css',import.meta.url),'utf8');

test('Premium operations use authenticated backend connections, rules, health and cases',()=>{
 for(const endpoint of ["/operations/health","/connections","/rules","/cases?limit=50"]){
  assert.ok(script.includes(endpoint),'Missing required backend API: '+endpoint);
 }
 assert.match(script,/async function operations\(\)/);
 assert.match(script,/async function cases\(\)/);
 assert.match(script,/Routing control plane/);
 assert.match(script,/Financial investigations/);
});

test('Financial interface distinguishes payment verification from callback transport',()=>{
 assert.match(script,/Callback acknowledgement is not proof of funds/);
 assert.match(script,/A connection test is not a successful payment/);
 assert.match(script,/Settlement verification requires authoritative bank or PSP records/);
 assert.match(script,/paymentEventTimeline\(r\.timeline,x\)/);
 assert.match(script,/Idempotency-Key/);
});

test('Premium operations remain permission and merchant scoped',()=>{
 assert.match(script,/function withMerchantScope\(path\)/);
 assert.match(script,/selectedMerchantId/);
 assert.match(script,/allowed\('webhooks\.manage'\)/);
 assert.match(script,/['"]\/connections['"]\+scope/);
 assert.match(script,/['"]\/cases\?limit=50['"]/);
});

test('Payment, callback and case filters use text nodes rather than HTML injection',()=>{
 assert.match(script,/function el\(tag,cls,content\).*textContent=String\(content\)/);
 assert.match(script,/premium-payment-toolbar/);
 assert.match(script,/category\.addEventListener\('change',paint\)/);
 assert.match(script,/state\.addEventListener\('change',paint\)/);
 assert.match(css,/premium-route-grid/);
});
