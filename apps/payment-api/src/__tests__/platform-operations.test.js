import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Database, runMigrations } from '@youpi/db';
import { HttpServer } from '../server.js';
import { registerPlatformOperations } from '../platform/operations.js';

function fixture() {
  const db = new Database({ inMemory: true }); runMigrations(db);
  for (const id of ['merchant-a', 'merchant-b']) db.execute('INSERT INTO merchants (id,business_name,slug,contact_email,contact_phone,webhook_secret) VALUES (?,?,?,?,?,?)',[id,id,id,`${id}@example.test`,'9000000000','isolated-test-secret']);
  const server = new HttpServer();
  registerPlatformOperations(server,{db},{authorize:(req,p)=>req.platform.permissions.includes('*')||req.platform.permissions.includes(p)});
  const admin={userId:'finance-1',platform:true,permissions:['*']};
  const tenant={userId:'owner-a',merchantId:'merchant-a',platform:false,permissions:['operations.read','operations.write','transactions.read','finance.read']};
  async function request(method,path,body,actor=admin) {
    const url=new URL(path,'http://localhost'); const route=server.routes.find(r=>r.method===method&&r.regex.test(url.pathname));
    assert.ok(route,`route ${method} ${path} exists`);
    const match=url.pathname.match(route.regex), params=Object.fromEntries(route.paramNames.map((n,i)=>[n,match[i+1]]));
    const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url=path;req.headers={};req.platform=actor;
    let result; const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(value){result={status:this.status,headers:this.headers,body:this.headers?.['Content-Type']?.includes('json')?JSON.parse(value):value};}};
    await route.handler(req,res,params); return result;
  }
  function order(id,merchantId,amount,method='UPI',confirmed='2026-10-15T12:00:00.000Z',status='SUCCESS',session=null) {
    db.execute('INSERT INTO payment_orders (id,merchant_id,merchant_order_id,amount_paise,payment_method,status,confirmed_at,created_at,payment_session_id) VALUES (?,?,?,?,?,?,?,?,?)',[id,merchantId,id,amount,method,status,confirmed,confirmed,session]);
  }
  return {db,request,admin,tenant,order};
}

test('operations deny missing scope and isolate transactions, evidence and cases by authenticated merchant',async()=>{
  const f=fixture();try {
    f.order('oa','merchant-a',10001);f.order('ob','merchant-b',99999);
    const denied=await f.request('GET','/api/platform/v1/transactions',undefined,{...f.tenant,permissions:[]});assert.equal(denied.status,403);
    assert.equal((await f.request('GET','/api/platform/v1/transactions?merchantId=merchant-b',undefined,f.tenant)).status,403);
    const own=await f.request('GET','/api/platform/v1/transactions',undefined,f.tenant);assert.equal(own.body.total,1);assert.equal(own.body.items[0].id,'oa');
    assert.equal((await f.request('GET','/api/platform/v1/transactions/ob',undefined,f.tenant)).status,404);
    const created=await f.request('POST','/api/platform/v1/cases',{merchantId:'merchant-b',kind:'DISPUTE',title:'Wrong tenant',description:'Evidence'},f.tenant);assert.equal(created.status,403);
    assert.equal((await f.request('POST','/api/platform/v1/cases',{kind:'DISPUTE',title:'Wrong payment',description:'Evidence',paymentId:'ob'},f.tenant)).status,404);
  } finally {f.db.close();}
});

test('transactions deduplicate linked sessions, filter and report only persisted evidence',async()=>{
  const f=fixture();try {
    f.db.execute("INSERT INTO payment_sessions(id,merchant_id,order_id,amount_paise,status,created_at) VALUES ('session-a','merchant-a','order-a',10001,'SUCCESS','2026-10-15T12:00:00.000Z')");
    f.order('oa','merchant-a',10001,'UPI',undefined,'SUCCESS','session-a');f.order('ob','merchant-b',20002);
    const result=await f.request('GET','/api/platform/v1/transactions?merchantId=merchant-a&from=2026-10-01&to=2026-11-01&minAmount=10000&limit=1');assert.equal(result.body.total,1);
    assert.equal((await f.request('GET','/api/platform/v1/analytics',undefined,f.tenant)).body.successfulAmountPaise,'10001');
    const detail=await f.request('GET','/api/platform/v1/transactions/oa');assert.deepEqual(detail.body.timeline,[]);
    f.db.execute("INSERT INTO collection_events(id,payment_order_id,event_type,new_status,actor_type,created_at) VALUES ('ev1','oa','CONFIRMED','SUCCESS','PROVIDER','2026-10-15T12:00:00.000Z')");
    assert.equal((await f.request('GET','/api/platform/v1/transactions/oa')).body.timeline[0].id,'ev1');
  }finally{f.db.close();}
});

test('case workflow persists notes and transitions, rejects closed case changes and cross tenant reads',async()=>{
  const f=fixture();try {
    let r=await f.request('POST','/api/platform/v1/cases',{merchantId:'merchant-a',kind:'INCIDENT',title:'Connection outage',description:'Provider reports unavailable'});assert.equal(r.status,201);const id=r.body.case.id;
    for(const status of ['INVESTIGATING','RESOLVED','CLOSED']) {r=await f.request('POST',`/api/platform/v1/cases/${id}/events`,{status,note:`Action: ${status}`});assert.equal(r.status,200);}
    assert.equal(r.body.timeline.length,4);assert.equal(r.body.case.status,'CLOSED');
    assert.equal((await f.request('POST',`/api/platform/v1/cases/${id}/events`,{status:'OPEN',note:'restart'})).status,409);
    assert.equal((await f.request('GET',`/api/platform/v1/cases/${id}`,undefined,{...f.tenant,merchantId:'merchant-b'})).status,404);
    assert.equal(f.db.queryOne('SELECT COUNT(*) AS n FROM pp_case_events WHERE case_id=?',[id]).n,4);
  } finally {f.db.close();}
});

test('billing calculates exact half-up fees/tax once, excludes COD and period boundaries, records external payments explicitly',async()=>{
  const f=fixture();try {
    const plan=await f.request('POST','/api/platform/v1/billing/plans',{name:'Usage',subscriptionPaise:'101',perTransactionPaise:'3',percentageBps:125,taxBps:1800});assert.equal(plan.status,201);
    assert.equal((await f.request('POST','/api/platform/v1/billing/subscriptions',{merchantId:'merchant-a',planId:plan.body.plan.id,effectiveFrom:'2026-10-01'})).status,201);
    f.order('bill-a','merchant-a',10001);f.order('bill-b','merchant-a',40);f.order('cod','merchant-a',50000,'COD');f.order('next','merchant-a',80000,'UPI','2026-11-01T00:00:00.000Z');f.order('previous','merchant-a',90000,'UPI','2026-09-30T23:59:59.999Z');f.order('pending','merchant-a',40000,'UPI',undefined,'PENDING');f.order('other','merchant-b',88888);
    let invoice=await f.request('POST','/api/platform/v1/billing/invoices',{merchantId:'merchant-a',period:'2026-10'});assert.equal(invoice.status,201);
    const id=invoice.body.invoice.id;assert.equal(invoice.body.invoice.usage_count,2);assert.equal(invoice.body.invoice.subtotal_paise,'233');assert.equal(invoice.body.invoice.tax_paise,'42');assert.equal(invoice.body.invoice.total_paise,'275');assert.equal(invoice.body.invoice.status,'ISSUED');
    const replay=await f.request('POST','/api/platform/v1/billing/invoices',{merchantId:'merchant-a',period:'2026-10'});assert.equal(replay.body.invoice.id,id);assert.equal(f.db.queryOne('SELECT COUNT(*) AS n FROM pp_invoices').n,1);
    assert.equal((await f.request('POST',`/api/platform/v1/billing/invoices/${id}/payments`,{})).status,400);
    assert.equal((await f.request('POST',`/api/platform/v1/billing/invoices/${id}/payments`,{externalReference:'bank-transfer-reference',reason:'Checked external bank credit'})).body.invoice.status,'PAID');
    assert.equal((await f.request('GET',`/api/platform/v1/billing/invoices/${id}`,undefined,{...f.tenant,merchantId:'merchant-b'})).status,404);
    assert.equal((await f.request('POST','/api/platform/v1/billing/plans',{name:'Tenant'},f.tenant)).status,403);
    assert.equal(f.db.queryOne('SELECT COUNT(*) AS n FROM ledger_transactions').n,0);
    assert.match((await f.request('GET','/api/platform/v1/billing/statements.csv',undefined,f.tenant)).body,/275/);
  } finally {f.db.close();}
});

test('billing tiers and merchant overrides snapshot immutably; credit notes cannot exceed invoice balance',async()=>{
  const f=fixture();try {
    const plan=(await f.request('POST','/api/platform/v1/billing/plans',{name:'Tiered',tiers:[{upTo:1,perTransactionPaise:'5',percentageBps:0},{upTo:null,perTransactionPaise:'2',percentageBps:0}]})).body.plan;
    await f.request('POST','/api/platform/v1/billing/subscriptions',{merchantId:'merchant-a',planId:plan.id,effectiveFrom:'2026-10-01',overrides:{subscriptionPaise:'7'}});
    f.order('one','merchant-a',100);f.order('two','merchant-a',100);
    const invoice=(await f.request('POST','/api/platform/v1/billing/invoices',{merchantId:'merchant-a',period:'2026-10'})).body.invoice;assert.equal(invoice.total_paise,'14');
    let credit=await f.request('POST',`/api/platform/v1/billing/invoices/${invoice.id}/credit-notes`,{amountPaise:'10',reason:'Agreed service adjustment',idempotencyKey:'credit-1'});assert.equal(credit.status,201);
    credit=await f.request('POST',`/api/platform/v1/billing/invoices/${invoice.id}/credit-notes`,{amountPaise:'10',reason:'Agreed service adjustment',idempotencyKey:'credit-1'});assert.equal(credit.status,200);
    assert.equal((await f.request('POST',`/api/platform/v1/billing/invoices/${invoice.id}/credit-notes`,{amountPaise:'5',reason:'Excess',idempotencyKey:'credit-2'})).status,409);
  }finally{f.db.close();}
});

test('health reports actual scoped observer heartbeat and persisted callback outcomes without credentials',async()=>{
  const f=fixture();try{
    f.db.execute("INSERT INTO android_devices(id,merchant_id,device_name,signing_key_hash,last_heartbeat_at) VALUES ('phone-a','merchant-a','Bank phone','private-hash','2026-10-30T12:00:00Z')");
    f.db.execute("INSERT INTO android_devices(id,merchant_id,device_name,signing_key_hash) VALUES ('phone-b','merchant-b','Other phone','private-hash')");
    f.db.execute("INSERT INTO provider_connections(id,merchant_id,provider_name,client_secret_encrypted,status) VALUES ('provider-a','merchant-a','CASHFREE','private-secret','NOT CONFIGURED')");
    f.order('hook-order','merchant-a',100);
    f.db.execute("INSERT INTO provider_webhook_deliveries(id,merchant_id,payment_id,event_type,payload,endpoint_url,attempt_count,is_successful,next_retry_at) VALUES ('delivery-a','merchant-a','hook-order','payment.success','{}','https://example.test/hook',1,0,'2026-11-01T00:00:00Z')");
    const r=await f.request('GET','/api/platform/v1/operations/health',undefined,f.tenant);assert.equal(r.status,200);assert.equal(r.body.observers.length,1);assert.equal(r.body.observers[0].last_heartbeat_at,'2026-10-30T12:00:00Z');assert.equal(r.body.callbacks.pending,1);assert.equal(r.body.callbacks.failed,0);assert.equal(r.body.providers[0].client_secret_encrypted,undefined);assert.equal(r.body.observers[0].signing_key_hash,undefined);
  }finally{f.db.close();}
});

test('billing preserves amounts above Number precision and rejects malformed pricing and replay changes',async()=>{
  const f=fixture();try{
    assert.equal((await f.request('POST','/api/platform/v1/billing/plans',{name:'Bad',subscriptionPaise:'1.25'})).status,400);
    assert.equal((await f.request('POST','/api/platform/v1/billing/plans',{name:'Bad',tiers:[{upTo:5},{upTo:3},{upTo:null}]})).status,400);
    const plan=(await f.request('POST','/api/platform/v1/billing/plans',{name:'Exact',subscriptionPaise:'9007199254740993',taxBps:1800})).body.plan;
    await f.request('POST','/api/platform/v1/billing/subscriptions',{merchantId:'merchant-a',planId:plan.id,effectiveFrom:'2026-10-01'});
    const invoice=(await f.request('POST','/api/platform/v1/billing/invoices',{merchantId:'merchant-a',period:'2026-10'})).body.invoice;assert.equal(invoice.subtotal_paise,'9007199254740993');assert.equal(invoice.tax_paise,'1621295865853379');assert.equal(invoice.total_paise,'10628495120594372');
    const path=`/api/platform/v1/billing/invoices/${invoice.id}/credit-notes`;
    assert.equal((await f.request('POST',path,{amountPaise:'10',reason:'Adjustment',idempotencyKey:'stable'})).status,201);
    assert.equal((await f.request('POST',path,{amountPaise:'11',reason:'Adjustment',idempotencyKey:'stable'})).status,409);
    assert.equal((await f.request('POST','/api/platform/v1/billing/subscriptions',{merchantId:'merchant-a',planId:plan.id,effectiveFrom:'2026-10-01'})).status,409);
  }finally{f.db.close();}
});

test('evidence timeline exposes saved observations as supplementary and actual callbacks only',async()=>{
  const f=fixture();try{
    f.db.execute("INSERT INTO payment_receiving_accounts(id,merchant_id,upi_id,payee_name) VALUES ('receiving-a','merchant-a','example@upi','Test merchant')");
    f.db.execute("INSERT INTO payment_sessions(id,merchant_id,receiving_account_id,order_id,amount_paise,status) VALUES ('evidence-a','merchant-a','receiving-a','evidence-order',100,'PROCESSING')");
    f.db.execute("INSERT INTO payment_observations(id,receiving_account_id,source,amount_paise,observed_at,fingerprint_hash,attributed_payment_id) VALUES ('observation-a','receiving-a','SMS',100,'2026-10-31T01:02:03Z','test-fingerprint','evidence-a')");
    const r=await f.request('GET','/api/platform/v1/transactions/evidence-a',undefined,f.tenant);assert.equal(r.status,200);assert.equal(r.body.timeline.length,1);assert.equal(r.body.timeline[0].event_type,'SUPPLEMENTARY_OBSERVATION');assert.equal(r.body.timeline[0].source,'SMS');assert.equal(r.body.transaction.status,'PROCESSING');
  }finally{f.db.close();}
});

test('a session billed before provider linkage cannot be billed again as a provider order',async()=>{
  const f=fixture();try{
    const plan=(await f.request('POST','/api/platform/v1/billing/plans',{name:'Usage',perTransactionPaise:'5'})).body.plan;
    await f.request('POST','/api/platform/v1/billing/subscriptions',{merchantId:'merchant-a',planId:plan.id,effectiveFrom:'2026-09-01'});
    f.db.execute("INSERT INTO payment_sessions(id,merchant_id,order_id,amount_paise,status,completed_at) VALUES ('old-session','merchant-a','stable-order',100,'SUCCESS','2026-09-30T23:59:59.000Z')");
    const september=await f.request('POST','/api/platform/v1/billing/invoices',{merchantId:'merchant-a',period:'2026-09'});assert.equal(september.body.invoice.usage_count,1);
    f.db.execute("INSERT INTO payment_orders(id,merchant_id,merchant_order_id,amount_paise,status,confirmed_at,payment_session_id) VALUES ('linked-order','merchant-a','stable-order',100,'SUCCESS','2026-10-01T00:00:01.000Z','old-session')");
    const october=await f.request('POST','/api/platform/v1/billing/invoices',{merchantId:'merchant-a',period:'2026-10'});assert.equal(october.status,201);assert.equal(october.body.invoice.usage_count,0);assert.equal(october.body.invoice.total_paise,'0');
  }finally{f.db.close();}
});


test('platform owner sees all merchant KPIs while merchant roles see only their own records',async()=>{
 const f=fixture();try{
  f.order('merchant-a-success','merchant-a',10501);
  f.order('merchant-a-pending','merchant-a',2500,'UPI',undefined,'PENDING');
  f.order('merchant-b-success','merchant-b',30250);
  f.order('merchant-b-cod','merchant-b',4500,'COD',undefined,'SUCCESS');
  const platform=await f.request('GET','/api/platform/v1/dashboard/kpis');
  assert.equal(platform.status,200);
  assert.equal(platform.body.scope,'PLATFORM');
  assert.equal(platform.body.merchantCount,2);
  assert.equal(platform.body.summary.transactions,4);
  assert.equal(platform.body.summary.confirmed,3);
  assert.equal(platform.body.summary.pending,1);
  assert.equal(platform.body.summary.confirmedPaise,'40751');
  assert.equal(platform.body.merchantBreakdown.length,2);
  const selected=await f.request('GET','/api/platform/v1/dashboard/kpis?merchantId=merchant-b');
  assert.equal(selected.body.summary.transactions,2);
  assert.equal(selected.body.summary.confirmedPaise,'30250');
  const tenant=await f.request('GET','/api/platform/v1/dashboard/kpis',undefined,f.tenant);
  assert.equal(tenant.status,200);
  assert.equal(tenant.body.scope,'MERCHANT');
  assert.equal(tenant.body.summary.transactions,2);
  assert.equal(tenant.body.summary.confirmedPaise,'10501');
  assert.deepEqual(tenant.body.merchantBreakdown,[]);
  assert.equal((await f.request('GET','/api/platform/v1/dashboard/kpis?merchantId=merchant-b',undefined,f.tenant)).status,403);
  assert.equal((await f.request('GET','/api/platform/v1/dashboard/kpis',undefined,{...f.tenant,permissions:[]})).status,403);
 }finally{f.db.close();}
});

test('API and callback failures are visible across platform but tenant-isolated for merchants',async()=>{
 const f=fixture();try{
  f.order('merchant-a-order','merchant-a',1500);
  f.order('merchant-b-order','merchant-b',3500);
  for(const [id,merchant,status] of [['api-a','merchant-a',502],['api-b','merchant-b',401],['api-ok','merchant-a',200]]){
   f.db.execute('INSERT INTO pp_api_requests(id,key_id,merchant_id,method,path,status,duration_ms,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [id,null,merchant,'POST','/v1/payments',status,100,'2026-11-09T13:00:00Z']);
  }
  for(const [id,merchant,order] of [['delivery-a','merchant-a','merchant-a-order'],['delivery-b','merchant-b','merchant-b-order']]){
   f.db.execute('INSERT INTO provider_webhook_deliveries(id,merchant_id,payment_id,event_type,payload,endpoint_url,attempt_count,is_successful,next_retry_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [id,merchant,order,'payment.updated','{}','https://example.test/events',2,0,null]);
  }
  const platform=await f.request('GET','/api/platform/v1/dashboard/api-failures');
  assert.equal(platform.status,200);
  assert.equal(platform.body.api.recorded,3);
  assert.equal(platform.body.api.failures,2);
  assert.equal(platform.body.api.serverErrors,1);
  assert.equal(platform.body.callbacks.length,2);
  assert.ok(!JSON.stringify(platform.body).includes('private-secret'));
  const tenant=await f.request('GET','/api/platform/v1/dashboard/api-failures',undefined,f.tenant);
  assert.equal(tenant.status,200);
  assert.equal(tenant.body.api.recorded,2);
  assert.equal(tenant.body.api.failures,1);
  assert.equal(tenant.body.callbacks.length,1);
  assert.equal(tenant.body.callbacks[0].merchantId,'merchant-a');
  assert.equal((await f.request('GET','/api/platform/v1/dashboard/api-failures?merchantId=merchant-b',undefined,f.tenant)).status,403);
  assert.equal((await f.request('GET','/api/platform/v1/dashboard/api-failures',undefined,{...f.tenant,permissions:[]})).status,403);
 }finally{f.db.close();}
});
