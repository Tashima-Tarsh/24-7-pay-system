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
 for(const route of ['/transactions','/analytics','/merchants','/operations/health','/cases','/receiving-accounts','/integration-readiness','/api-keys','/sessions','/connections','/rules','/webhook-deliveries','/billing/invoices','/staff','/settings'])
   assert.ok(js.includes(route),'UI does not request route '+route);
 const identity=fs.readFileSync('apps/payment-api/src/platform/identity.js','utf8');
 assert.match(identity,/req\.platformBearer=Boolean\(bearer\)/);
 assert.match(identity,/x-247-auth-mode/);
 assert.match(identity,/if\(!req\.platformBearer\)res\.setHeader/);
 const server=fs.readFileSync('server.mjs','utf8');
 assert.match(server,/pathname === '\/merchant'.*pathname === '\/platform'/);
 assert.match(server,/platform\.html/);
});
