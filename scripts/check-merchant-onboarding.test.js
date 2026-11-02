import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'dynamo-onboarding-check-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'',SQLITE_DB_PATH:path.join(sandbox,'fixture.sqlite'),BASE_CHECKOUT_URL:'http://localhost',BASE_PAYMENT_API_URL:'http://localhost',DYNAMO_PUBLIC_URL:'http://localhost',ENCRYPTION_MASTER_KEY:crypto.randomBytes(32).toString('hex'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),INITIAL_ADMIN_EMAIL:'operator@onboarding.test',INITIAL_ADMIN_PASSWORD:crypto.randomBytes(32).toString('hex')});
const {Database,runMigrations}=await import('@youpi/db');const {createPaymentApp}=await import('../apps/payment-api/src/index.js');
test('provider integration pack includes its approved route and genuine-customer placeholders',async()=>{
 const {merchantIntegrationDetails}=await import('../apps/payment-api/src/platform/merchant-integration.js');
 const details=merchantIntegrationDetails({merchantRepo:{findById:()=>({businessName:'Provider merchant',webhookUrl:'https://merchant.test/callback'})},db:{queryOne:()=>({id:'approved-provider-connection'})}},'provider-merchant');
 assert.equal(details.createPayment.body.connectionId,'approved-provider-connection');assert.ok(details.createPayment.body.customer.phone.includes('ACTUAL'));assert.equal(details.merchantId,'provider-merchant');
});
test('isolated merchant creation and login flow',async()=>{
 const db=new Database({inMemory:true});runMigrations(db);const app=createPaymentApp(db);const delivered=[];app.context.platformDelivery=async message=>{delivered.push(message);};
 app.context.webhookEngine.retryPending=async()=>[];
 await new Promise(r=>app.rawServer.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.rawServer.address().port,root='/api/platform/v1';
 const token=crypto.randomBytes(32).toString('hex'),stamp=new Date().toISOString();
 db.execute('INSERT INTO pp_users(id,email,password_hash,role,active,email_verified,mobile_verified,mfa_secret,created_at) VALUES(?,?,?,?,1,1,1,?,?)',['onboarding-root','operator@onboarding.test','unused','SUPER_ADMIN','synthetic-mfa',stamp]);
 db.execute('INSERT INTO pp_sessions(id,user_id,token_hash,csrf_token,mfa_verified,expires_at,created_at) VALUES(?,?,?,?,1,?,?)',['onboarding-root-session','onboarding-root',crypto.createHash('sha256').update(token).digest('hex'),'csrf',new Date(Date.now()+600000).toISOString(),stamp]);
 const admin={cookie:'dp_platform_session='+token,'x-csrf-token':'csrf'};
 async function call(endpoint,body,headers={}){const response=await fetch(base+endpoint,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
 try{
  const made=await call(root+'/merchants',{businessName:'Example Games',contactName:'Synthetic Owner',email:'owner@example-games.test',mobile:'+919000000001',category:'Synthetic integration test'},admin);assert.equal(made.status,201,JSON.stringify(made.body));assert.equal(made.body.status,'ACTIVE');const mid=made.body.merchantId;
  const login=await call(root+'/login',{email:'owner@example-games.test',password:'owner-test-password',merchantId:mid});assert.equal(login.status,200);
 }finally{await new Promise(r=>app.rawServer.close());db.close();}
});