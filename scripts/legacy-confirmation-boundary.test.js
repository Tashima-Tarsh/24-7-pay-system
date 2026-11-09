import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database, runMigrations } from '@youpi/db';
import { createPaymentApp } from '../apps/payment-api/src/index.js';

function request(base,path,authorization){
  return new Promise((resolve,reject)=>{
    const payload=JSON.stringify({paymentId:'forged',source:'GMAIL',utr:'123456789012'});
    const req=http.request(base+path,{method:'POST',headers:{
      'content-type':'application/json',
      ...(authorization?{authorization}:{}),
    }},res=>{
      let content='';res.on('data',c=>content+=c);res.on('end',()=>{
        try{resolve({status:res.statusCode,body:JSON.parse(content)})}
        catch(error){reject(error)}
      });
    });req.on('error',reject);req.end(payload);
  });
}

test('production blocks notification-only settlement and rejects arbitrary bearer tokens',async()=>{
  const db=new Database({inMemory:true});runMigrations(db);
  const app=createPaymentApp(db);
  await new Promise(r=>app.rawServer.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.rawServer.address().port;
  const old=process.env.NODE_ENV;
  try{
    process.env.NODE_ENV='production';
    for(const route of [
      '/api/v1/payments/arbitrary/manual-verify',
      '/api/v1/evidence/submit',
      '/api/v1/evidence/gmail-email',
      '/api/v1/evidence/android-sms',
      '/api/v1/evidence/direct-bank',
      '/api/v1/bank-reconciliation/run',
      '/api/v1/direct-bank/connectors'
    ]){
      const anonymous=await request(base,route);
      const forged=await request(base,route,'Bearer invalid-admin-token');
      assert.equal(anonymous.status,401,route+': '+JSON.stringify(anonymous.body));
      assert.equal(forged.status,401,route+': '+JSON.stringify(forged.body));
    }
    const payments=db.query('SELECT * FROM payment_orders');
    assert.equal(payments.length,0,'Untrusted notification routes cannot create settled payment orders');
  }finally{
    if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;
    app.destroy();app.rawServer.closeAllConnections();await new Promise(r=>app.rawServer.close(r));db.close();
  }
});
