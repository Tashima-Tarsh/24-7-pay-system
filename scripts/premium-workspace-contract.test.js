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

test('Premium workspace quick actions and payment chart are sourced from authenticated KPIs',()=>{
 assert.match(script,/function premiumChart\(summary\)/);
 assert.match(script,/result\.push\(premiumChart\(s\)\)/);
 assert.match(script,/function premiumEntryPoints\(\)/);
 assert.match(script,/result\.unshift\(premiumEntryPoints\(\)\)/);
 assert.match(script,/premiumAnimate\(content\)/);
 assert.match(script,/prefers-reduced-motion: reduce/);
});

test('Phosphor icons are self-hosted and include original MIT attribution',()=>{
 for(const name of ['chart','route','shield','code']){
  const icon=readFileSync(new URL('../public/assets/icons/phosphor-'+name+'.svg',import.meta.url),'utf8');
  assert.match(icon,/<svg/);assert.match(icon,/viewBox="0 0 256 256"/);
 }
 const license=readFileSync(new URL('../public/assets/icons/PHOSPHOR-LICENSE.txt',import.meta.url),'utf8');
 assert.match(license,/MIT License/);
 assert.match(script,/function premiumIcon\(name\)/);
});

test('Scalar API reference is sandboxed away from merchant session storage',()=>{
 const page=readFileSync(new URL('../public/api-reference.html',import.meta.url),'utf8');
 const frame=readFileSync(new URL('../public/scalar-frame.html',import.meta.url),'utf8');
 const schema=JSON.parse(readFileSync(new URL('../public/api-reference.json',import.meta.url),'utf8'));
 assert.match(page,/sandbox="allow-scripts"/);
 assert.doesNotMatch(page,/allow-same-origin/);
 assert.match(frame,/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference/);
 assert.match(frame,/createApiReference/);
 assert.match(frame,/agent:\{disabled:true\}/);
 assert.equal(schema.openapi,'3.0.3');
 assert.ok(schema.paths['/api/platform/v1/transactions']);
 const portal=readFileSync(new URL('../public/platform.html',import.meta.url),'utf8');
 assert.match(portal,/Content-Security-Policy|247-portal\.js/);
});
