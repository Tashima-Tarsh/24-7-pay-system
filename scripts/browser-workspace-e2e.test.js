import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
    await page.locator('button[data-step="1"]').click();
    assert.match(await page.locator('#journey-title').textContent(),/Let customers pay/);
    await page.goto(base+'/merchant',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#login-form').isVisible(),true,'Merchant sign-in form must render');
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
    await page.locator('button[data-view="receiving"]').click();
    await page.waitForFunction(()=>document.querySelector('#page-title')?.textContent?.includes('where payments'));
    await page.waitForSelector('#view-content form',{timeout:12000});
    await page.getByRole('heading',{name:'Add a receiving account'}).waitFor({timeout:12000});
    await page.locator('button[data-view="settings"]').click();
    await page.waitForFunction(()=>document.querySelector('#page-title')?.textContent?.includes('essentials'));
    const input=page.locator('#field-businessName');await input.fill('Browser Merchant Updated');
    await page.getByRole('button',{name:'Save business settings'}).click();
    await page.waitForSelector('#detail-layer:not([hidden])',{timeout:10000});
    assert.match(await page.locator('#detail-title').textContent(),/Settings updated/);
    await page.locator('#detail-close').click();
    await page.locator('#logout-button').click();
    await page.waitForSelector('#auth-view:not([hidden])');
    assert.equal((await context.cookies()).some(c=>c.name==='dp_platform_session'),false);
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
