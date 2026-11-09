import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Database,runMigrations,MerchantRepository} from '@youpi/db';
import {HttpServer} from '../server.js';
import {registerWebhookTestRoutes} from '../routes/webhooks.routes.js';
import {generateHmac} from '@youpi/common';

process.env.NODE_ENV='test';
process.env.ENCRYPTION_MASTER_KEY ||= crypto.randomBytes(32).toString('hex');

async function fixture(){
 const db=new Database({inMemory:true});runMigrations(db);
 const merchantRepo=new MerchantRepository(db);
 const a=merchantRepo.create({businessName:'Timeline Merchant A',slug:'timeline-a-'+crypto.randomUUID(),contactEmail:'timeline-a@example.test',
  contactPhone:'9000000001',webhookUrl:'https://merchant.example.test/webhook'});
 const b=merchantRepo.create({businessName:'Timeline Merchant B',slug:'timeline-b-'+crypto.randomUUID(),contactEmail:'timeline-b@example.test',
  contactPhone:'9000000002',webhookUrl:'https://merchant-b.example.test/webhook'});
 const transportCalls=[],audit=[];
 const server=new HttpServer();
 const identity={
   guard:async(req,res)=>{
     if(!req.headers.authorization){HttpServer.json(res,401,{error:'Authentication required'});return true;}
     req.platform={userId:'test-owner',merchantId:a.id,platform:false,permissions:['webhooks.manage'],role:'OWNER'};
     return false;
   },
   authorize:(req,p)=>Boolean(req.platform?.permissions?.includes(p)),
   audit:(req,action,id,details)=>audit.push({action,id,details})
 };
 server.use((req,res,path)=>path.startsWith('/api/platform/v1/')?identity.guard(req,res,path):false);
 registerWebhookTestRoutes(server,{db,merchantRepo,webhookTestTransport:async(url,options)=>{
  transportCalls.push({url,options});
  return {ok:true,status:204,text:async()=>''};
 }},identity);
 const http=server.createServer();await new Promise(r=>http.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+http.address().port;
 const call=async(path,{method='POST',body={},auth=true}={})=>{
  const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(auth?{authorization:'Bearer test-owner'}:{})},
    body:method==='GET'?undefined:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 };
 const close=async()=>{await new Promise(resolve=>http.close(resolve));db.close();};
 return {a,b,db,call,close,transportCalls,audit};
}
test('signed probe reuses real HMAC and cannot alter payments or normal callback queue',async()=>{
 const f=await fixture();try{
  const beforePayments=Number(f.db.queryOne('SELECT COUNT(*) AS n FROM payment_sessions').n);
  const beforeQueue=Number(f.db.queryOne('SELECT COUNT(*) AS n FROM webhook_deliveries').n);
  const result=await f.call('/api/platform/v1/webhooks/test');
  assert.equal(result.status,200);
  assert.equal(result.data.success,true);
  assert.equal(result.data.test,true);
  assert.equal(result.data.status_code,204);
  assert.equal(f.transportCalls.length,1);
  const {url,options}=f.transportCalls[0];
  assert.equal(url,'https://merchant.example.test/webhook');
  assert.equal(options.headers['X-Gateway-Event'],'WEBHOOK_TEST');
  assert.equal(options.headers['X-Gateway-Signature'],'sha256='+generateHmac(options.body,f.a.webhookSecret));
  assert.equal(options.headers['X-Gateway-Delivery-Id'],result.data.delivery_id);
  assert.equal(options.timeoutMs,5000);
  const payload=JSON.parse(options.body);
  assert.equal(payload.event,'WEBHOOK_TEST');
  assert.equal(payload.type,'webhook.test');
  assert.equal(payload.test,true);
  assert.equal(payload.merchantId,f.a.id);
  assert.equal(payload.data.status,'TEST_ONLY');
  assert.equal(payload.data.utr,null);
  assert.equal(payload.data.paymentId,null);
  assert.equal(Number(f.db.queryOne('SELECT COUNT(*) AS n FROM payment_sessions').n),beforePayments);
  assert.equal(Number(f.db.queryOne('SELECT COUNT(*) AS n FROM webhook_deliveries').n),beforeQueue);
  assert.equal(Number(f.db.queryOne('SELECT COUNT(*) AS n FROM pp_webhook_probe_results').n),1);
  assert.equal(f.audit[0].action,'WEBHOOK_CONNECTIVITY_TESTED');
  assert.equal((await f.call('/api/platform/v1/webhooks/test')).status,429,'Repeat probes must be rate-limited');
 }finally{await f.close();}
});
test('merchant alias uses authentication and cannot target another merchant',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/api/v1/merchant/webhooks/test',{auth:false})).status,401);
  assert.equal((await f.call('/api/v1/merchant/webhooks/test?merchantId='+encodeURIComponent(f.b.id))).status,403);
  const result=await f.call('/api/v1/merchant/webhooks/test');
  assert.equal(result.status,200);
  assert.equal(result.data.success,true);
  assert.equal(f.transportCalls.length,1);
 }finally{await f.close();}
});
test('invalid endpoint, missing URL and unknown caller never dispatch a probe',async()=>{
 const f=await fixture();try{
  f.db.execute('UPDATE merchants SET webhook_url=NULL WHERE id=?',[f.a.id]);
  const missing=await f.call('/api/platform/v1/webhooks/test');
  assert.equal(missing.status,400);
  assert.equal(missing.data.error_code,'NO_WEBHOOK_URL');
  f.db.execute("UPDATE merchants SET webhook_url='http://127.0.0.1/private' WHERE id=?",[f.a.id]);
  const blocked=await f.call('/api/platform/v1/webhooks/test');
  assert.equal(blocked.status,400);
  assert.equal(blocked.data.error_code,'INVALID_WEBHOOK_URL');
  assert.equal(f.transportCalls.length,0);
 }finally{await f.close();}
});
