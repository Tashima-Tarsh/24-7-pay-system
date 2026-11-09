import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Premium React app is outside the existing npm payment-engine workspaces',()=>{
 const root=JSON.parse(read('package.json'));assert.deepEqual(root.workspaces,['packages/*','apps/*']);
 const studio=JSON.parse(read('premium-studio/package.json'));assert.equal(studio.private,true);
 assert.ok(studio.dependencies.react);assert.ok(studio.dependencies['@visx/shape']);
 assert.ok(studio.dependencies.motion);assert.ok(studio.dependencies['@phosphor-icons/react']);
 assert.ok(studio.dependencies['@radix-ui/react-tabs']);
 assert.match(read('premium-studio/vite.config.ts'),/outDir:'\.\.\/public\/premium-studio'/);
});
test('Premium workspace reuses authenticated read API and only the approved payment creation write',()=>{
 const api=read('premium-studio/src/api.ts'),app=read('premium-studio/src/App.tsx');
 assert.match(api,/247pay-new-workspace-session/);
 assert.match(api,/Authorization:'Bearer '/);
 assert.match(api,/credentials:'omit'/);
 assert.match(api,/async function get<T>/);
 assert.match(api,/fetch\('\/api\/platform\/v1\/payments'/);
 assert.match(api,/method:'POST'/);
 assert.match(api,/Idempotency-Key/);
 assert.doesNotMatch(api,/method:['"]PUT|method:['"]PATCH|method:['"]DELETE/);
 assert.doesNotMatch(api,/\/verify-callback|\/settlement|\/ledger|\/mark-paid/);
 for(const path of ['/me','/dashboard/kpis','/transactions?limit=50','/webhook-deliveries'])assert.ok(app.includes(path),'Missing read endpoint: '+path);
 assert.doesNotMatch(app,/['"]\/payments['"],['"]POST/);
});
test('Migration leaves the production payment server and active portal untouched',()=>{
 const api=read('premium-studio/src/api.ts');
 assert.match(api,/new AuthRequired/);
 const doc=read('premium-studio/index.html');assert.match(doc,/noindex,nofollow/);
 assert.match(read('premium-studio/src/styles.css'),/prefers-reduced-motion/);
 assert.match(read('premium-studio/src/App.tsx'),/useReducedMotion/);
 assert.match(read('premium-studio/src/App.tsx'),/Pie data=\{parts\}/);
 assert.match(read('premium-studio/src/App.tsx'),/Tabs\.Root/);
});

test('Real checkout link creation enforces merchant permissions, idempotency and checkout origin',()=>{
 const creator=read('premium-studio/src/PaymentLinkStudio.tsx');
 const app=read('premium-studio/src/App.tsx');
 const api=read('premium-studio/src/api.ts');
 assert.match(creator,/canCreate&&!isPlatform&&!loading/);
 assert.match(creator,/createPaymentLink\(\{orderId,amount,currency:'INR'\},key\)/);
 assert.match(creator,/attemptKey\|\|crypto\.randomUUID\(\)/);
 assert.match(creator,/url\.origin!==window\.location\.origin/);
 assert.match(creator,/checkoutUrl/);
 assert.match(creator,/supported UPI app intents/);
 assert.doesNotMatch(creator,/Mark as paid|I have paid|submitUTR|forceSuccess|settlePayment/i);
 assert.match(api,/x-247-auth-mode/);
 assert.match(app,/effectiveTab==='payment-links'/);
 assert.match(app,/permissions\?\.includes\('payments\.create'\)/);
});
test('Cinematic system has accessible login and reduced-motion controls',()=>{
 const login=read('premium-studio/src/PremiumSignIn.tsx');
 const css=read('premium-studio/src/styles.css');
 assert.match(login,/autoComplete="current-password"/);
 assert.match(login,/signIn\(email\.trim\(\),password\)/);
 assert.match(css,/cinematic-hero/);
 assert.match(css,/apple-top-cta/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('Platform and merchant receive distinct premium studio navigation and merchant UPI onboarding',()=>{
 const app=read('premium-studio/src/App.tsx');
 const upi=read('premium-studio/src/MerchantUpiAccounts.tsx');
 const api=read('premium-studio/src/api.ts');
 assert.match(app,/const merchantTabs:/);
 assert.match(app,/const platformTabs:/);
 assert.match(app,/const availableTabs=scoped\?platformTabs:merchantTabs/);
 assert.match(app,/setTab\('admin'\)/);
 assert.match(app,/Receiving UPI IDs/);
 assert.match(app,/canCreate=Boolean\(!data\.user\?\.platform/);
 assert.match(app,/canManageVpa=Boolean\(!data\.user\?\.platform/);
 assert.match(upi,/get<\{accounts:ReceivingAccount\[\]\}>\('\/receiving-accounts'/);
 assert.match(upi,/addReceivingUpi\(vpa,name\)/);
 assert.match(upi,/setReceivingUpiActive\(account\.id,next\)/);
 assert.match(upi,/window\.confirm/);
 assert.match(upi,/merchant OWNER or ADMIN/);
 assert.match(api,/\/receiving-accounts/);
 assert.match(api,/method:'POST'/);
 assert.doesNotMatch(api,/\/mark-paid|\/ledger\/credit|\/settle-order/);
});
test('New UPI reliability module remains nonmutating and preflight is informational',()=>{
 const checks=read('packages/core/src/vpa/intent-reliability.js');
 const checkout=read('apps/payment-api/src/routes/checkout.routes.js');
 assert.match(checks,/proofOfPayment:false/);
 assert.match(checks,/INSUFFICIENT_VERIFIED_HISTORY/);
 assert.match(checks,/event\.authoritative!==true/);
 assert.match(checks,/event\.merchantId!==merchantId/);
 assert.match(checkout,/intentPreflight: upiUri \? inspectUpiIntent/);
});
