import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('the new portal client parses and has no dependency on old cookie auth',()=>{
 const html=fs.readFileSync('public/platform.html','utf8');
 const js=fs.readFileSync('public/assets/247-portal.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'247-portal.js'}));
 assert.match(html,/id="workspace"/);
 assert.match(html,/id="login-form"/);
 assert.match(html,/\/assets\/247-portal\.js/);
 assert.match(js,/x-247-auth-mode/);
 assert.match(js,/Authorization:'Bearer '/);
 assert.match(js,/credentials:'omit'/);
 assert.doesNotMatch(js,/document\.cookie|credentials:\s*['"]include['"]/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('portal views are backed by real payment, identity and operations APIs',()=>{
 const js=fs.readFileSync('public/assets/247-portal.js','utf8');
 for(const route of ['/transactions','/dashboard/kpis','/dashboard/api-failures','/merchants','/operations/health','/cases','/receiving-accounts','/integration-readiness','/api-keys','/sessions','/connections','/rules','/webhook-deliveries','/billing/invoices','/staff','/settings'])
   assert.ok(js.includes(route),'UI does not request route '+route);
 const identity=fs.readFileSync('apps/payment-api/src/platform/identity.js','utf8');
 assert.match(identity,/req\.platformBearer=Boolean\(bearer\)/);
 assert.match(identity,/x-247-auth-mode/);
 assert.match(identity,/if\(!req\.platformBearer\)res\.setHeader/);
 const server=fs.readFileSync('server.mjs','utf8');
 assert.match(server,/pathname === '\/merchant'.*pathname === '\/platform'/);
 assert.match(server,/platform\.html/);
});

test('new checkout is an independent payment-status client without manual completion',()=>{
 const html=fs.readFileSync('public/checkout-next.html','utf8');
 const js=fs.readFileSync('public/assets/247-checkout.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'247-checkout.js'}));
 assert.match(html,/id="payment-instructions"/);
 assert.match(html,/id="result-panel"/);
 assert.match(js,/terminalStates\.has\(status\)/);
 assert.match(js,/new EventSource/);
 assert.doesNotMatch(js,/document\.cookie|credentials:\s*['"]include['"]/);
 assert.doesNotMatch(html,/I've Paid|Submit UTR|Mark as paid/);
});

test('all new user surfaces share the premium vector brand without cookie or payment changes',()=>{
 const logo=fs.readFileSync('public/assets/pay247-mark.svg','utf8');
 const css=fs.readFileSync('public/assets/247-brand.css','utf8');
 assert.match(logo,/<svg[^>]+viewBox="0 0 128 128"/);
 assert.match(logo,/#264C39/);
 for(const [file,surface] of [
   ['public/landing.html','marketing'],
   ['public/platform.html','workspace'],
   ['public/checkout-next.html','checkout'],
   ['public/admin.html','legacy-admin']
 ]){
   const html=fs.readFileSync(file,'utf8');
   assert.match(html, new RegExp('data-pay-surface="'+surface+'"'));
   assert.match(html,/\/assets\/247-brand\.css/);
   assert.match(html,/\/assets\/pay247-mark\.svg/);
 }
 for(const c of ['#F6F1E6','#183D30','#B84D2F','#D9AC63'])assert.ok(css.includes(c),'Missing premium design token '+c);
 assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\s*\{\s*password/);
});

test('platform scope uses an explicitly selected merchant and never impersonates the merchant',()=>{
 const html=fs.readFileSync('public/platform.html','utf8');
 const js=fs.readFileSync('public/assets/247-portal.js','utf8');
 assert.match(html,/id="merchant-scope"/);
 assert.match(js,/url\.searchParams\.set\('merchantId',selectedMerchantId\)/);
 assert.match(js,/Create merchant and invite owner/);
 assert.doesNotMatch(js,/impersonateToken|assumeMerchantSession/);
});

test('merchant owner invitation is accepted using the public backend route, never a hardcoded login',()=>{
 const html=fs.readFileSync('public/platform.html','utf8');
 const script=fs.readFileSync('public/assets/247-portal.js','utf8');
 assert.match(html,/id="owner-invitation-form"/);
 assert.match(html,/autocomplete="new-password"/);
 assert.match(script,/\/owner-invitations\/accept/);
 assert.match(script,/history\.replaceState/);
 assert.match(script,/location\.hash\.startsWith\(prefix\)/);
 assert.doesNotMatch(script,/Anita@906099|24@gmai\.com/);
});

test('merchant scope helper and payment health UI are reachable from every required view',()=>{
 const html=fs.readFileSync('public/platform.html','utf8');
 const js=fs.readFileSync('public/assets/247-portal.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'247-portal.js'}));
 assert.match(js,/function merchantSelectionCard\(\)/);
 for(const view of ['receiving','developers','callbacks','settings','verification','invite-email'])
   assert.match(js,new RegExp("async function "+(view==='invite-email'?'invitationEmail':view)+"\\("));
 for(const view of ['developers','callbacks','settings','verification','invite-email'])
   assert.ok(html.includes('data-view="'+view+'"'),'Menu item missing: '+view);
 assert.match(js,/\/webhook-deliveries\/.*\/retry/);
 assert.match(js,/\/dashboard\/kpis/);
 assert.match(js,/\/transactions\//);
});
