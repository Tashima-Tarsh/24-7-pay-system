import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from '@playwright/test';
import {generateQrDataUri,buildUpiPaymentIntentLinks} from '@youpi/common';

async function freePort(){
 const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');
 const port=s.address().port;await new Promise(done=>s.close(done));return port;
}
test('premium merchant workspace renders on a real mobile viewport with accessible operations navigation',{timeout:120000},async()=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pay247-mobile-smoke-'));
 const email='mobile-'+crypto.randomUUID()+'@example.test',password='mobile-smoke-password-2026';
 const env={...process.env,PORT:String(port),NODE_ENV:'test',DATABASE_URL:'',SQLITE_DB_PATH:path.join(dir,'test.sqlite'),DYNAMO_PUBLIC_URL:base,
  INITIAL_ADMIN_EMAIL:'bootstrap@example.test',INITIAL_ADMIN_PASSWORD:crypto.randomBytes(24).toString('hex'),
  ENCRYPTION_MASTER_KEY:crypto.randomBytes(32).toString('hex'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),
  ORDER_SIGNING_SECRET:crypto.randomBytes(32).toString('hex'),GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',REDIS_URL:''};
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 const closed=once(child,'close');let browser;
 try{
  let ready=false;
  for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Test gateway stopped: '+output.slice(-2000));try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,200));}
  assert.ok(ready,'Test gateway failed readiness: '+output.slice(-1500));
  const registration=await fetch(base+'/api/platform/v1/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,businessName:'Mobile Smoke Merchant',contactName:'Test Owner',mobile:'9876543210'})});
  assert.equal(registration.status,201,'Registration: '+await registration.text());
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
  const page=await context.newPage();
  await page.goto(base+'/merchant',{waitUntil:'domcontentloaded'});
  await page.getByRole('textbox',{name:'Work email'}).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button',{name:'Enter workspace'}).click();
  await page.getByRole('tab',{name:'Ledger'}).waitFor({timeout:25000});
  const dimensions=await page.evaluate(()=>{
   const shell=document.querySelector('.studio-shell'),sidebar=document.querySelector('.studio-sidebar'),main=document.querySelector('.studio-main');
   if(!shell||!sidebar||!main)return null;
   const a=sidebar.getBoundingClientRect(),b=main.getBoundingClientRect();
   return {shellWidth:shell.getBoundingClientRect().width,sidebarWidth:a.width,mainWidth:b.width,sidebarBottom:a.bottom,mainTop:b.top,viewport:window.innerWidth,documentWidth:document.documentElement.scrollWidth};
  });
  assert.ok(dimensions,'Workspace shell missing');
  assert.ok(dimensions.sidebarWidth>=dimensions.viewport-3,'Sidebar should span mobile viewport');
  assert.ok(dimensions.mainWidth>=dimensions.viewport-3,'Main content should span mobile viewport');
  assert.ok(dimensions.mainTop>=dimensions.sidebarBottom-3,'Navigation should be above content, not beside it');
  assert.ok(dimensions.documentWidth<=dimensions.viewport+3,'Page-wide horizontal overflow is not acceptable');
  await page.getByRole('tab',{name:'Ledger'}).click();
  await page.getByRole('heading',{name:'Financial ledger'}).waitFor({timeout:15000});
  await page.getByRole('tab',{name:'API & providers'}).click();
  await page.getByRole('heading',{name:'API & provider operations'}).waitFor({timeout:15000});
  // Scoped credential issuance/revocation runs only against this isolated test merchant.
  await page.getByRole('textbox',{name:'Key label'}).fill('Browser QA key');
  await page.getByRole('button',{name:'Issue API key'}).click();
  const keySecret=page.getByRole('textbox',{name:'New API key secret'});
  await keySecret.waitFor({timeout:15000});
  assert.match(await keySecret.inputValue(),/^dp_test_/);
  await page.getByRole('button',{name:'Dismiss secret'}).click();
  const apiRow=page.getByRole('row',{name:/Browser QA key/});
  await apiRow.getByRole('button',{name:'Revoke'}).waitFor({timeout:15000});
  page.once('dialog',dialog=>dialog.accept());
  await apiRow.getByRole('button',{name:'Revoke'}).click();
  await apiRow.getByText('Revoked').waitFor({timeout:15000});

  await page.getByRole('tab',{name:'Risk controls'}).click();
  await page.getByRole('heading',{name:'Risk & payment controls'}).waitFor({timeout:15000});
  await page.getByRole('tab',{name:'Cases'}).click();
  await page.getByRole('heading',{name:'Reconciliation & support cases'}).waitFor({timeout:15000});
  await page.getByRole('region',{name:'Reconciliation and support cases'}).waitFor({timeout:15000});
  await page.getByRole('tab',{name:'Notifications'}).click();
  await page.getByRole('heading',{name:'Notification delivery centre'}).waitFor({timeout:15000});
  await page.getByRole('region',{name:'Outgoing notification status'}).waitFor({timeout:15000});
  // A public-hostname mismatch must never hide a valid order's checkout link.
  // Intercept only the creation request: no real payment is created by this test.
  await page.route('**/api/platform/v1/payments',async route=>{
   if(route.request().method()!=='POST')return route.continue();
   return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({
    paymentId:'e2e-checkout-id-123',orderId:'MOBILE_E2E_ORDER',amount:'1.00',status:'ACTIVE',
    checkoutUrl:'https://different-configured-host.example/checkout/e2e-checkout-id-123'
   })});
  });
  await page.getByRole('tab',{name:'Payment links'}).click();
  await page.getByRole('textbox',{name:'Amount (INR)'}).fill('1');
  await page.getByRole('button',{name:'Create payment link'}).last().click();
  const openCheckout=page.getByRole('link',{name:/Open real UPI checkout/});
  await openCheckout.waitFor({timeout:15000});
  assert.equal(await openCheckout.getAttribute('href'),'/checkout/e2e-checkout-id-123');
  const uri='upi://pay?pa=qaexample%40okbank&pn=Test+Merchant&am=1.00&cu=INR';
  let activeMode='MERCHANT';
  await page.route('**/api/v1/checkout/e2e-checkout-id-123/state',route=>route.fulfill({
   status:200,contentType:'application/json',body:JSON.stringify({
    paymentId:'e2e-checkout-id-123',orderId:'MOBILE_E2E_ORDER',amount:'1.00',status:'ACTIVE',
    merchantName:'Test Merchant',payeeVpa:'qaexample@okbank',payeeName:'Test Merchant',
    upiMode:activeMode,isMerchantEnabled:activeMode==='MERCHANT',
    upiUri:uri,upiQr:generateQrDataUri(uri),upiDeepLinks:buildUpiPaymentIntentLinks(uri)
   })
  }));
  await page.goto(base+'/checkout/e2e-checkout-id-123',{waitUntil:'domcontentloaded'});
  await page.locator('#gpay-open').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#qr-panel').isHidden(),true,'merchant mobile uses app intents, not the QR route');
  assert.ok((await page.locator('#qr').getAttribute('src')).startsWith('data:image/svg+xml;base64,'));
  for(const id of ['upi-open','gpay-open','phonepe-open','paytm-open','bhim-open']){
   const button=page.locator('#'+id);
   await button.waitFor({state:'visible'});
   assert.ok(await button.getAttribute('href'),id+' must have a payment handoff URI');
  }
  assert.ok((await page.locator('#gpay-open').getAttribute('href')).includes('package=com.google.android.apps.nbu.paisa.user'));
  assert.ok((await page.locator('#phonepe-open').getAttribute('href')).includes('package=com.phonepe.app'));
  assert.ok((await page.locator('#bhim-open').getAttribute('href')).includes('package=in.org.npci.upiapp'));
  // The customer's app launch must never itself mark a payment successful.
  await page.evaluate(()=>{
   const button=document.querySelector('#gpay-open');
   button.addEventListener('click',event=>event.preventDefault(),{capture:true,once:true});
   button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  });
  await page.getByText(/After completing or cancelling in the UPI app/).waitFor({timeout:15000});
  assert.match(await page.locator('#status-title').innerText(),/Ready when you are/);
  // Personal VPA: tapping the displayed QR is a native UPI gesture, without
  // forcing a Google Pay/PhonePe package. Merchant buttons are not shown.
  activeMode='NON_MERCHANT';
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#qr-open-upi[href^="upi://pay?"]').waitFor({state:'visible',timeout:15000});
  assert.equal(new URL(await page.locator('#qr-open-upi').getAttribute('href')).searchParams.get('pa'),'qaexample@okbank');
  assert.equal(await page.locator('#app-actions').isHidden(),true,'personal VPA must show only QR');
  assert.equal(await page.locator('#qr-panel').isVisible(),true,'personal QR must be visible');
  await page.evaluate(()=>{
    const qr=document.querySelector('#qr-open-upi');
    qr.addEventListener('click',event=>event.preventDefault(),{capture:true,once:true});
    qr.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  });
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('upi-checkout-handoff:e2e-checkout-id-123')),'1','QR tap must record handoff even with merchant-only action panel hidden');

  const ios=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'});
  const iosPage=await ios.newPage();
  await iosPage.route('**/api/v1/checkout/e2e-checkout-id-123/state',route=>route.fulfill({
   status:200,contentType:'application/json',body:JSON.stringify({
    paymentId:'e2e-checkout-id-123',orderId:'MOBILE_E2E_ORDER',amount:'1.00',status:'ACTIVE',
    merchantName:'Test Merchant',payeeVpa:'qaexample@okbank',payeeName:'Test Merchant',
    upiUri:uri,upiQr:generateQrDataUri(uri),upiDeepLinks:buildUpiPaymentIntentLinks(uri)
   })
  }));
  await iosPage.goto(base+'/checkout/e2e-checkout-id-123',{waitUntil:'domcontentloaded'});
  await iosPage.locator('#gpay-open').waitFor({state:'visible',timeout:15000});
  assert.equal(await iosPage.locator('#qr-panel').isHidden(),true);
  assert.match(await iosPage.locator('#gpay-open').getAttribute('href')||'',/^gpay:\/\/upi\/pay\?/);
  assert.match(await iosPage.locator('#phonepe-open').getAttribute('href')||'',/^phonepe:\/\/upi\/pay\?/);
  assert.match(await iosPage.locator('#paytm-open').getAttribute('href')||'',/^paytmmp:\/\/pay\?/);
  assert.match(await iosPage.locator('#bhim-open').getAttribute('href')||'',/^bhim:\/\/upi\/pay\?/);
  await ios.close();



  // End-to-end checkout rendering from a real isolated payment session, not a mocked response.
  const authResponse=await fetch(base+'/api/platform/v1/login',{method:'POST',headers:{'content-type':'application/json','x-247-auth-mode':'bearer'},body:JSON.stringify({email,password})});
  assert.equal(authResponse.status,200,'Isolated merchant login failed');
  const auth=await authResponse.json();
  const scopedHeaders={'content-type':'application/json',authorization:'Bearer '+auth.sessionToken};
  const receiver=await fetch(base+'/api/platform/v1/receiving-accounts',{method:'POST',headers:scopedHeaders,body:JSON.stringify({upiId:'smoke-test@okbank',payeeName:'Mobile Smoke Merchant',confirmVpaOwnership:true})});
  assert.equal(receiver.status,201,'Could not configure test receiving UPI account: '+await receiver.text());
  const payment=await fetch(base+'/api/platform/v1/payments',{method:'POST',headers:{...scopedHeaders,'idempotency-key':'checkout-render-test-01'},body:JSON.stringify({orderId:'CHECKOUT_SMOKE_01',amount:'2.00',currency:'INR'})});
  const paymentBody=await payment.text();
  assert.equal(payment.status,201,'Real isolated payment request failed: '+paymentBody);
  const created=JSON.parse(paymentBody);
  assert.ok(created.paymentId,'Payment creation must return a payment identifier');
  const state=await fetch(base+'/api/v1/checkout/'+encodeURIComponent(created.paymentId)+'/state');
  assert.equal(state.status,200);
  const checkoutState=await state.json();
  assert.equal(checkoutState.payeeVpa,'smoke-test@okbank','Checkout must use the session receiving account');
  if(checkoutState.status==='ACTIVE'){
   assert.match(checkoutState.upiUri||'',/^upi:\/\/pay\?/);
   assert.match(checkoutState.upiQr||'',/^data:image\/svg\+xml;base64,/);
   const parsed=new URL(checkoutState.upiUri);
   assert.equal(parsed.searchParams.get('pn'),'Mobile Smoke Merchant','Payee name must be encoded exactly once');
   assert.equal(parsed.searchParams.get('pa'),'smoke-test@okbank');
   assert.equal(parsed.searchParams.get('am'),'2.00');
   assert.equal(parsed.searchParams.get('cu'),'INR');
   assert.equal(parsed.searchParams.get('tr'),'CHECKOUTSMOKE01');
   assert.equal(parsed.searchParams.get('mc'),null,'Do not fabricate a merchant category code');

   const checkout=await context.newPage();
   await checkout.goto(base+'/checkout/'+encodeURIComponent(created.paymentId),{waitUntil:'domcontentloaded'});
   await checkout.locator('#gpay-open[href]').waitFor({timeout:15000});
   assert.equal(await checkout.locator('#qr-panel').isHidden(),true);
   assert.match(await checkout.locator('#upi-open').getAttribute('href')||'',/^upi:\/\/pay\?/);
   assert.match(await checkout.locator('#gpay-open').getAttribute('href')||'',/^intent:\/\/pay\?/);
   assert.match(await checkout.locator('#phonepe-open').getAttribute('href')||'',/^intent:\/\/pay\?/);
   await checkout.close();
  }else{
   assert.equal(checkoutState.status,'QUEUED','Only a queued order may withhold payment instructions');
  }
  await context.close();
 }finally{if(browser)await browser.close();child.kill();await closed;fs.rmSync(dir,{recursive:true,force:true});}
});
