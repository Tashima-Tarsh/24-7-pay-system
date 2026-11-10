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
  await context.close();
 }finally{if(browser)await browser.close();child.kill();await closed;fs.rmSync(dir,{recursive:true,force:true});}
});
