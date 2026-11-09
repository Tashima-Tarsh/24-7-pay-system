import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const browserOwnerPassword='browser-ci-owner-strong-password';
const browserOwnerSalt=crypto.randomBytes(16).toString('hex');
const browserOwnerHash='scrypt:'+browserOwnerSalt+':'+crypto.scryptSync(browserOwnerPassword,browserOwnerSalt,64).toString('hex');
import {chromium} from '@playwright/test';

async function freePort(){
  const server=net.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('public website and new merchant workspace work without legacy cookies',{timeout:120000},async()=>{
  const port=await freePort(),base='http://127.0.0.1:'+port;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pay247-browser-'));
  const env={
    ...process.env,
    NODE_ENV:'test',
    DATABASE_URL:'',
    PORT:String(port),
    DYNAMO_PUBLIC_URL:base,
    SQLITE_DB_PATH:path.join(folder,'isolated.sqlite'),
    INITIAL_ADMIN_EMAIL:'browser-test@example.test',
    INITIAL_ADMIN_PASSWORD:crypto.randomBytes(28).toString('hex'),
    ADMIN_LOGIN_EMAIL:'platform-owner-browser@example.test',
    ADMIN_LOGIN_PASSWORD_HASH:browserOwnerHash,
    ADMIN_OWNER_BOOTSTRAP_VERSION:'browser-acceptance-v1',
    ENCRYPTION_MASTER_KEY:crypto.randomBytes(32).toString('hex'),
    JWT_SECRET:crypto.randomBytes(32).toString('hex'),
    ORDER_SIGNING_SECRET:crypto.randomBytes(32).toString('hex'),
    REDIS_URL:'',
    GMAIL_CLIENT_ID:'',
    GMAIL_CLIENT_SECRET:'',
    GMAIL_REFRESH_TOKEN:'',
    SMS_GATEWAY_URL:''
  };
  const child=spawn(process.execPath,['server.mjs'],{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=String(c));child.stderr.on('data',c=>output+=String(c));
  const closed=once(child,'close');
  let browser;
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error('Test server exited: '+output.slice(-2500));
      try{const response=await fetch(base+'/health');if(response.ok){ready=true;break;}}catch{}
      await pause(250);
    }
    assert.ok(ready,'Test gateway not ready: '+output.slice(-2500));
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:1320,height:860}});
    const page=await context.newPage();
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#hero-title').isVisible(),true,'Marketing hero must render');
    assert.equal(await page.locator('body').getAttribute('data-pay-surface'),'marketing');
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(246, 241, 230)','New ivory brand should be visible');
    assert.equal(await page.locator('.brand-emblem').first().isVisible(),true,'Crisp vector brand mark should render');
    await page.locator('button[data-step="1"]').click();
    assert.match(await page.locator('#journey-title').textContent(),/Let customers pay/);
    await page.goto(base+'/merchant',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#login-form').isVisible(),true,'Merchant sign-in form must render');
    assert.equal(await page.locator('body').getAttribute('data-pay-surface'),'workspace');
    assert.equal(await page.locator('.auth-logo .brand-emblem').isVisible(),true);
    const email='merchant-browser-acceptance@example.test',password='test-browser-secure-password-2026';
    const register=await fetch(base+'/api/platform/v1/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,businessName:'Browser Test Merchant',contactName:'Test Merchant',mobile:'9000000000'})});
    assert.equal(register.status,201,'Merchant test fixture registration failed: '+await register.text());
    await page.fill('#email',email);
    await page.fill('#password',password);
    await page.click('#login-submit');
    await page.waitForSelector('#workspace:not([hidden])',{timeout:12000});
    await page.waitForSelector('.metric',{timeout:12000});
    assert.equal((await context.cookies()).some(c=>c.name==='dp_platform_session'),false,'New workspace must not rely on legacy login cookies');
    await page.locator('button[data-view="payments"]').click();
    await page.waitForFunction(()=>document.querySelector('#page-title')?.textContent?.includes('Every order'));
    await page.waitForSelector('#view-content .panel-card',{timeout:12000});
    await page.getByRole('heading',{name:'Payment history'}).waitFor({timeout:12000});
    // Exercise the actual timeline renderer with synthetic browser-only data.
    const timeline=await page.evaluate(()=>{
      const events=[{event_type:'SUPPLEMENTARY_OBSERVATION',source:'MAIL',created_at:'2026-11-09T10:00:00Z'},
        {event_type:'CALLBACK_DELIVERY',is_successful:1,response_status:200,created_at:'2026-11-09T10:00:01Z'}];
      const element=paymentEventTimeline(events,{status:'PENDING',created_at:'2026-11-09T10:00:00Z'});
      return {count:element.children.length,text:element.textContent};
    });
    assert.equal(timeline.count,2);
    assert.match(timeline.text,/not payment proof/);
    assert.match(timeline.text,/HTTP acknowledgement/);

    await page.locator('button[data-view="receiving"]').click();
    await page.waitForFunction(()=>document.querySelector('#page-title')?.textContent?.includes('where payments'));
    await page.waitForSelector('#view-content form',{timeout:12000});
    await page.getByRole('heading',{name:'Add a receiving account'}).waitFor({timeout:12000});
    await page.locator('button[data-view="developers"]').click();
    await page.getByRole('heading',{name:'Merchant API credentials'}).waitFor({timeout:12000});
    assert.equal(await page.locator('button[data-view="invite-email"]').isVisible(),false,'Merchant must not see the platform Gmail configuration');
    const deniedMail=await page.evaluate(async()=>{
      const secret=sessionStorage.getItem('247pay-new-workspace-session');
      const r=await fetch('/api/platform/v1/gmail/sender',{headers:{Authorization:'Bearer '+secret}});
      return r.status;
    });
    assert.equal(deniedMail,403,'Merchant must not inspect or configure the platform invitation sender');

    await page.getByRole('heading',{name:'API request history'}).waitFor({timeout:12000});
    await page.locator('button[data-view="callbacks"]').click();
    await page.getByRole('heading',{name:'Callback deliveries'}).waitFor({timeout:12000});
    await page.locator('button[data-view="verification"]').click();
    await page.getByRole('heading',{name:'Money-flow verification'}).waitFor({timeout:12000});

    await page.locator('button[data-view="settings"]').click();
    await page.waitForFunction(()=>document.querySelector('#page-title')?.textContent?.includes('essentials'));
    const input=page.locator('#field-businessName');await input.fill('Browser Merchant Updated');
    await page.getByRole('button',{name:'Save business settings'}).click();
    await page.waitForSelector('#detail-layer:not([hidden])',{timeout:10000});
    assert.match(await page.locator('#detail-title').textContent(),/Business settings saved/);
    await page.locator('#detail-close').click();
    await page.locator('#logout-button').click();
    await page.waitForSelector('#auth-view:not([hidden])');
    assert.equal((await context.cookies()).some(c=>c.name==='dp_platform_session'),false);
    // The platform owner must see all merchants, financial KPIs and diagnostics.
    await page.goto(base+'/platform',{waitUntil:'domcontentloaded'});
    await page.fill('#email','platform-owner-browser@example.test');
    await page.fill('#password',browserOwnerPassword);
    await page.click('#login-submit');
    await page.waitForSelector('#workspace:not([hidden])',{timeout:12000});
    await page.getByRole('heading',{name:'Platform performance'}).waitFor({timeout:12000});
    await page.getByRole('heading',{name:'Merchant performance'}).waitFor({timeout:12000});
    await page.locator('button[data-view="developers"]').click();
    await page.getByRole('heading',{name:'Select a business first'}).waitFor({timeout:12000});
    await page.locator('button[data-view="callbacks"]').click();
    await page.getByRole('heading',{name:'Select a business first'}).waitFor({timeout:12000});
    await page.locator('button[data-view="settings"]').click();
    await page.getByRole('heading',{name:'Select a business first'}).waitFor({timeout:12000});
    await page.locator('button[data-view="invite-email"]').click();
    await page.getByRole('heading',{name:'Personal Gmail sender'}).waitFor({timeout:12000});
    await page.getByText('Not connected').first().waitFor({timeout:12000});
    await page.fill('#field-gmailClientId','123456-browserci.apps.googleusercontent.com');
    await page.fill('#field-gmailClientSecret','GOCSPX_browser_test_secret_only');
    await page.getByRole('button',{name:'Save OAuth configuration'}).click();
    await page.waitForSelector('#detail-layer:not([hidden])',{timeout:12000});
    assert.match(await page.locator('#detail-title').textContent(),/OAuth application saved/);
    await page.locator('#detail-close').click();
    await page.getByRole('button',{name:'Connect my Gmail'}).waitFor({timeout:12000});
    // Do not complete external consent or send real mail during CI.

    await page.locator('button[data-view="overview"]').click();
    await page.getByRole('heading',{name:'Platform performance'}).waitFor({timeout:12000});

    const selector=page.locator('#merchant-scope');
    await page.waitForFunction(()=>document.querySelector('#merchant-scope')?.options?.length>1);
    await selector.selectOption({index:1});
    await page.locator('button[data-view="developers"]').click();
    await page.getByRole('heading',{name:'Merchant API credentials'}).waitFor({timeout:12000});
    await page.locator('button[data-view="callbacks"]').click();
    await page.getByRole('heading',{name:'Callback deliveries'}).waitFor({timeout:12000});
    await page.locator('button[data-view="settings"]').click();
    await page.getByRole('heading',{name:'Business profile and callback configuration'}).waitFor({timeout:12000});
    await page.getByRole('heading',{name:'Test webhook endpoint'}).waitFor({timeout:12000});
    await page.getByText('No webhook destination is configured.').waitFor({timeout:12000});

    await page.locator('button[data-view="overview"]').click();

    await page.getByRole('heading',{name:'Production readiness'}).waitFor({timeout:12000});
    await page.locator('button[data-view="diagnostics"]').click();
    await page.getByRole('heading',{name:'Recent API failures'}).waitFor({timeout:12000});
    await page.getByRole('heading',{name:'Callback delivery queue'}).waitFor({timeout:12000});
    await page.locator('button[data-view="merchants"]').click();
    await page.getByRole('heading',{name:'Add a merchant'}).waitFor({timeout:12000});
    // Owner-driven onboarding: creation, one-time invitation, password setup,
    // and merchant-only login must all work in the actual browser.
    const merchantEmail='merchant-owner-e2e@example.test';
    const merchantPassword='merchant-e2e-secure-password-2026';
    await page.fill('#field-merchantBusiness','Invited Browser Merchant');
    await page.fill('#field-merchantContact','Invited Owner');
    await page.fill('#field-merchantEmail',merchantEmail);
    await page.fill('#field-merchantMobile','9000000032');
    await page.getByRole('button',{name:'Create merchant and invite owner'}).click();
    await page.waitForSelector('#detail-layer:not([hidden])',{timeout:12000});
    assert.match(await page.locator('#detail-title').textContent(),/Merchant created/);
    const invitationPath=await page.locator('#detail-body a[href*="#owner-invitation/"]').getAttribute('href');
    assert.ok(invitationPath?.startsWith('/platform#owner-invitation/'),'One-time owner activation URL must be generated when mail delivery is absent');
    await page.locator('#detail-close').click();
    await page.locator('#logout-button').click();
    await page.waitForSelector('#auth-view:not([hidden])');
    await page.goto(base+invitationPath,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#owner-invitation-panel:not([hidden])',{timeout:12000});
    assert.equal(await page.locator('#login-form').isVisible(),false,'An invitation must not expose the normal login form');
    await page.fill('#owner-invite-password',merchantPassword);
    await page.fill('#owner-invite-confirm',merchantPassword);
    await page.click('#owner-invite-submit');
    await page.waitForSelector('#login-form:not([hidden])',{timeout:12000});
    assert.equal(new URL(page.url()).hash,'','The one-time token must be removed from the URL after use');
    await page.fill('#email',merchantEmail);
    await page.fill('#password',merchantPassword);
    await page.click('#login-submit');
    await page.waitForSelector('#workspace:not([hidden])',{timeout:12000});
    await page.getByRole('heading',{name:'Business account'}).waitFor({timeout:12000});
    assert.equal(await page.locator('button[data-view="merchants"]').isVisible(),false,'Merchant role must not see platform merchant directory');
    assert.equal(await page.locator('#merchant-scope-panel').isVisible(),false,'Merchant role must not select another tenant');
    const denied=await page.evaluate(async()=>{
      const secret=sessionStorage.getItem('247pay-new-workspace-session');
      const r=await fetch('/api/platform/v1/dashboard/kpis?merchantId=00000000-0000-0000-0000-000000000001',{headers:{Authorization:'Bearer '+secret}});
      return r.status;
    });
    assert.equal(denied,403,'Merchant cannot query a different tenant by changing the URL');
    assert.equal((await context.cookies()).some(c=>c.name==='dp_platform_session'),false,'New merchant portal must stay cookie-free');
    await page.locator('#logout-button').click();
    await page.waitForSelector('#auth-view:not([hidden])');
    await page.waitForSelector('#auth-view:not([hidden])');
    await page.setViewportSize({width:390,height:800});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#mobile-menu').click();
    assert.equal(await page.locator('#primary-nav').evaluate(n=>n.classList.contains('open')),true,'Mobile navigation must open');
    await context.close();
  }finally{
    if(browser)await browser.close();
    child.kill();
    await Promise.race([closed,pause(4500)]);
    fs.rmSync(folder,{recursive:true,force:true});
  }
});


test('new customer checkout never shows a stale QR or accepts a browser-reported success',{timeout:45000},async()=>{
  let state='QUEUED';
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="204" height="204"><rect width="204" height="204" fill="black"/></svg>').toString('base64');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/api/v1/checkout/e2e-order/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});
      res.write(': connected\n\n');
      return;
    }
    if(pathname==='/api/v1/checkout/e2e-order/state'){
      const payable=state==='ACTIVE';
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({
        paymentId:'e2e-order',orderId:'ORDER-TEST',merchantName:'Example Merchant',
        amount:'500.00',currency:'INR',status:state,isTerminal:state==='SUCCESS',
        payeeVpa:'merchant@upi',payeeName:'Example Merchant',
        upiUri:payable?'upi://pay?pa=merchant%40upi&pn=Example&am=500.00&cu=INR':null,
        upiQr:payable?'data:image/svg+xml;base64,'+svg:null,
        upiDeepLinks:{},timeRemainingSeconds:payable?180:0,
        upiDetails:state==='SUCCESS'?{utr:'123456789012'}:null
      }));
      return;
    }
    const assets={
      '/checkout/e2e-order':['public/checkout-next.html','text/html; charset=utf-8'],
      '/assets/247-checkout.js':['public/assets/247-checkout.js','text/javascript; charset=utf-8'],
      '/assets/247-checkout.css':['public/assets/247-checkout.css','text/css; charset=utf-8'],
      '/assets/247-brand.css':['public/assets/247-brand.css','text/css; charset=utf-8'],
      '/assets/pay247-mark.svg':['public/assets/pay247-mark.svg','image/svg+xml']
    };
    if(assets[pathname]){
      const [file,mime]=assets[pathname];
      res.writeHead(200,{'Content-Type':mime});res.end(fs.readFileSync(file));return;
    }
    res.writeHead(404);res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const page=await browser.newPage();
    const visit=async()=>{await page.goto(base+'/checkout/e2e-order',{waitUntil:'domcontentloaded'});await page.waitForSelector('#checkout-content:not([hidden])');};
    await visit();
    assert.equal(await page.locator('body').getAttribute('data-pay-surface'),'checkout');
    assert.equal(await page.locator('.brand-emblem').isVisible(),true);
    assert.match(await page.locator('#status-title').textContent(),/being prepared/);
    assert.equal(await page.locator('#payment-instructions').isVisible(),false,'Queued session must not expose payment instructions');
    state='ACTIVE';await visit();
    assert.equal(await page.locator('#payment-instructions').isVisible(),true,'Active session must show payment details');
    assert.equal(await page.locator('#qr').isVisible(),true,'Active session must display server-supplied QR');
    assert.equal(await page.getByText("I've Paid").count(),0,'No manual customer success button');
    state='VERIFICATION_PENDING';await visit();
    assert.equal(await page.locator('#payment-instructions').isVisible(),false,'Verification must hide stale payable QR');
    assert.match(await page.locator('#status-title').textContent(),/Checking payment confirmation/);
    state='SUCCESS';await visit();
    await page.waitForSelector('#result-panel:not([hidden])');
    assert.match(await page.locator('#result-title').textContent(),/Payment confirmed/);
    assert.equal(await page.locator('#payment-instructions').isVisible(),false);
  }finally{
    if(browser)await browser.close();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
