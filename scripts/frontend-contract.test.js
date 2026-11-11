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

test('mobile premium workspace source contains the full-width navigation contract',()=>{
 const source=fs.readFileSync('premium-studio/src/styles.css','utf8');
 const html=fs.readFileSync('public/premium-studio/index.html','utf8');
 const asset=html.match(/href="(\/premium-studio\/assets\/[^"]+\.css)"/)?.[1];
 assert.ok(asset,'premium studio stylesheet must be linked');
 const deployed=fs.readFileSync('public'+asset,'utf8');
 const mobile=source.slice(source.lastIndexOf('/* Mobile workspace: final cascade override'));
 assert.match(mobile,/@media\s*\(max-width:\s*800px\)/);
 assert.match(mobile,/\.studio-shell\s*\{[^}]*display:\s*block/);
 assert.match(mobile,/\.studio-sidebar\s*\{[^}]*width:\s*100%/);
 assert.match(mobile,/\.studio-sidebar\s+\.sidebar-tabs\s*\{[^}]*display:\s*flex/);
 assert.match(mobile,/\.studio-sidebar\s+\.sidebar-tab\s*\{[^}]*flex:\s*0 0 auto/);
 assert.match(mobile,/\.studio-content\s*\{[^}]*width:\s*100%/);
 // Vite minifies compiled CSS, stripping comments and whitespace.
 assert.match(deployed,/studio-shell/);
 assert.match(deployed,/studio-sidebar/);
 assert.match(deployed,/sidebar-tabs/);
});

test('dedicated checkout uses native intent anchors and warns about QR-gallery limit',()=>{
  const source=fs.readFileSync('public/assets/247-checkout.js','utf8');
  assert.match(source,/el\.href=allowed/);
  assert.doesNotMatch(source,/location\.href=uri/);
  assert.match(fs.readFileSync('public/checkout-next.html','utf8'),/On another device, scan this QR/);
  assert.match(source,/setHandoff\(true\)/);
});


test('browser merchant SDK never invents port 7000 for hosted checkout', () => {
  for (const path of ['packages/merchant-sdk/src/youpi.js', 'packages/merchant-sdk/src/youpi-checkout.js']) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /scriptUrl \? scriptUrl\.origin : window\.location\.origin/);
    assert.match(source, /scriptConfig\.portalUrl \|\| window\.location\.origin/);
    assert.doesNotMatch(source, /window\.location\.hostname\s*\+\s*['"]:7000['"]/);
  }
});


test('Render-served checkout keeps a stable return URL and refreshes on browser return without declaring success',()=>{
  const server=fs.readFileSync('server.mjs','utf8');
  const html=fs.readFileSync('public/checkout-next.html','utf8');
  const js=fs.readFileSync('public/assets/247-checkout.js','utf8');
  assert.match(server, /readFile\(path\.join\(PUBLIC_DIR, 'checkout-next\.html'\)\)/);
  assert.match(html, /id="checkout-return-link"/);
  assert.match(html, /id="check-after-upi"/);
  assert.match(js, /checkoutReturnUrl=paymentId\?new URL\('\/checkout\/'\+encodeURIComponent\(paymentId\),location\.origin\)\.href/);
  assert.match(js, /sessionStorage\.setItem\(handoffStorageKey,'1'\)/);
  assert.match(js, /document\.addEventListener\('visibilitychange',refreshAfterAppReturn\)/);
  assert.match(js, /window\.addEventListener\('pageshow',refreshAfterAppReturn\)/);
  assert.doesNotMatch(js, /location\.href=uri/);
  assert.doesNotMatch(js, /\/payment-done['"]/);
});

test('personal checkout has tappable generic UPI QR, merchant checkout has branded app intents',()=>{
 const html=fs.readFileSync('public/checkout-next.html','utf8');
 const js=fs.readFileSync('public/assets/247-checkout.js','utf8');
 assert.match(html,/id="qr-open-upi"/);
 assert.match(html,/id="branded-app-grid"/);
 assert.match(html,/id="qr-panel"/);
 assert.match(html,/id="qr-mode-instructions"/);
 assert.match(js,/data\.upiMode==='NON_MERCHANT'/);
 assert.match(js,/personalUpi&&mobile/);
 assert.match(js,/qrTap\.href=genericUpi/);
 assert.match(js,/\$\('app-actions'\)\.hidden=false/);
 assert.match(js,/if\(mobile && merchantUpi\)/);
 assert.match(js,/\$\('qr-panel'\)\.hidden=merchantUpi&&mobile/);
 assert.match(js,/\['upi-open',genericUpi,'upi:\/\/pay\?'\]/);
 assert.doesNotMatch(js,/qrTap\.onclick\s*=.*location/);
});

test('legacy receiving VPA is rejected by common guard and database boot retires it',()=>{
 const upi=fs.readFileSync('packages/common/src/upi.js','utf8');
 const migration=fs.readFileSync('packages/db/src/migrate.js','utf8');
 const repo=fs.readFileSync('packages/db/src/repositories/receiving-account.repository.js','utf8');
 assert.match(upi,/isRetiredReceivingVpa/);
 assert.match(migration,/UPDATE payment_receiving_accounts SET is_active=0/);
 assert.match(migration,/UPDATE pp_merchant_payment_profile SET is_active=0/);
 assert.match(migration,/if \(db.isInMemory && accounts.length === 0\)/);
 assert.match(repo,/isRetiredReceivingVpa\(data\.upiId\)/);
 assert.match(repo,/isRetiredReceivingVpa\(target\.upiId\)/);
});
