import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

test('unified server.mjs serves public pages and proxies /api/* to the in-process payment API',{timeout:45000},async()=>{
  // Reserve only the public gateway port; the payment API runs in-process on 6100.
  const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;s.close();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sanbook-hosted-'));
  const env={...process.env,DATABASE_URL:'',PORT:String(port),DYNAMO_PUBLIC_URL:`http://127.0.0.1:${port}`,SQLITE_DB_PATH:path.join(dir,'test.sqlite'),INITIAL_ADMIN_EMAIL:'hosted@example.test',INITIAL_ADMIN_PASSWORD:crypto.randomBytes(24).toString('hex'),ENCRYPTION_MASTER_KEY:crypto.randomBytes(32).toString('hex'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),ORDER_SIGNING_SECRET:crypto.randomBytes(32).toString('hex'),GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',SMS_GATEWAY_URL:'',REDIS_URL:'',NODE_ENV:'test'};
  const child=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true,cwd:process.cwd()});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const closed=once(child,'close');
  try{
   for(let i=0;i<150&&!output.includes('Payment API started on port');i++){
    if(child.exitCode!==null)assert.fail('server.mjs exited before readiness');
    await new Promise(r=>setTimeout(r,100));
   }
   assert.ok(output.includes('Payment API started on port'),'server.mjs did not become ready');
   const base=`http://127.0.0.1:${port}`;
   assert.equal((await fetch(base+'/_ready')).status,200,'/_ready health check must return 200');
   assert.equal((await fetch(base+'/')).status,200,'landing page must return 200');
   const workspace=await fetch(base+'/platform');
   assert.equal(workspace.status,200,'new workspace must be served');
   assert.match(await workspace.text(),/247-portal\.js/,'new workspace must load its own client');
   assert.match(workspace.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
   const merchant=await fetch(base+'/merchant');
   assert.equal(merchant.status,200,'merchant route must use new workspace');
   assert.match(await merchant.text(),/247-portal\.js/);
   assert.equal((await fetch(base+'/assets/247-portal.js')).status,200,'workspace JS asset must be served');
   assert.equal((await fetch(base+'/assets/247-portal.css')).status,200,'workspace CSS asset must be served');
   assert.equal((await fetch(base+'/checkout/test-order')).status,200,'checkout page must return 200');
   const apiRes=await fetch(base+'/api/v1/checkout/nonexistent/state');
   assert.equal(apiRes.status,404,'/api/* must be proxied to the payment API (404 from API for unknown session)');
  }finally{child.kill();await closed;}
 });
