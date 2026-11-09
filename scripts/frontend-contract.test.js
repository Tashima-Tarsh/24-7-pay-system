import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('hosted HTML has syntactically valid JavaScript',()=>{
  for(const path of ['public/checkout.html','public/admin.html','public/landing.html']){
    const html=fs.readFileSync(path,'utf8');
    for(const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
      // JSON-LD and other non-executable script types must not be parsed as JavaScript.
      const type=match[1]?.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if(type&&type!=='text/javascript'&&type!=='application/javascript'&&type!=='module')continue;
      if(match[2].trim()) assert.doesNotThrow(()=>new vm.Script(match[2],{filename:path}));
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

test('mobile premium workspace uses full-width content and horizontal navigation',()=>{
 const source=fs.readFileSync('premium-studio/src/styles.css','utf8');
 const html=fs.readFileSync('public/premium-studio/index.html','utf8');
 const asset=html.match(/href="(\/premium-studio\/assets\/[^\"]+\.css)"/)?.[1];
 assert.ok(asset,'premium studio stylesheet must be linked');
 const deployed=fs.readFileSync('public'+asset,'utf8');
 for(const css of [source,deployed]){
  const mobile=css.slice(css.lastIndexOf('/* Mobile workspace: final cascade override'));
  assert.match(mobile,/@media\s*\(max-width:\s*800px\)/);
  assert.match(mobile,/\.studio-shell\s*\{[^}]*display:\s*block/);
  assert.match(mobile,/\.studio-sidebar\s*\{[^}]*width:\s*100%/);
  assert.match(mobile,/\.studio-sidebar\s+\.sidebar-tabs\s*\{[^}]*display:\s*flex/);
  assert.match(mobile,/\.studio-sidebar\s+\.sidebar-tab\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(mobile,/\.studio-content\s*\{[^}]*width:\s*100%/);
 }
});
