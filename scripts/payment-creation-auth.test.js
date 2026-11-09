import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database, runMigrations } from '@youpi/db';
import { createPaymentApp } from '../apps/payment-api/src/index.js';

function request(base,path,data){
  return new Promise((resolve,reject)=>{
    const payload=JSON.stringify(data);
    const req=http.request(base+path,{method:'POST',headers:{'content-type':'application/json'}},res=>{
      let body='';
      res.on('data',chunk=>body+=chunk);
      res.on('end',()=>{let parsed;try{parsed=JSON.parse(body)}catch{parsed={}}resolve({status:res.statusCode,body:parsed})});
    });
    req.on('error',reject);req.end(payload);
  });
}
test('anonymous production requests cannot mint payment orders or create default-merchant sessions',async()=>{
  const db=new Database({inMemory:true});runMigrations(db);
  const app=createPaymentApp(db);const server=app.rawServer;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const old=process.env.NODE_ENV;
  try{
    process.env.NODE_ENV='production';
    const merchant=app.context.merchantRepo.getDefault();
    const order=await request(base,'/api/v1/orders',{merchant_id:merchant.id,amount_paise:100, payee_vpa:'merchant@upi'});
    assert.equal(order.status,401,JSON.stringify(order.body));
    assert.equal(order.body.code,'AUTH_REQUIRED');
    const payment=await request(base,'/api/v1/payments',{orderId:'guessed',amount:'1.00',currency:'INR'});
    assert.equal(payment.status,401,JSON.stringify(payment.body));
    assert.equal(payment.body.code,'AUTH_REQUIRED');
    assert.equal(db.query('SELECT * FROM payment_orders').length,0);
  }finally{
    if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;
    app.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();
  }
});
