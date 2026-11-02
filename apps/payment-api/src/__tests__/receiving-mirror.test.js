import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Database,runMigrations,MerchantRepository,ReceivingAccountRepository,PaymentSessionRepository} from '@youpi/db';
import {WebhookEngine} from '@youpi/core';
import {createReceivingMirror} from '../services/receiving-mirror.js';

test('paired receiving mirror deduplicates detection and queues a pending callback without crediting money',()=>{
 const db=new Database({inMemory:true});runMigrations(db);
 const merchants=new MerchantRepository(db),accounts=new ReceivingAccountRepository(db),sessions=new PaymentSessionRepository(db),m=merchants.getDefault();
 merchants.update(m.id,{webhookUrl:'https://merchant.example.test/callback'});
 const account=accounts.findActiveForMerchant(m.id),webhookEngine=new WebhookEngine({db,merchantRepo:merchants});
 webhookEngine.retryPending=async()=>[];
 const broadcasts=[],ctx={db,merchantRepo:merchants,accountRepo:accounts,sessionRepo:sessions,webhookEngine};
 const mirror=createReceivingMirror({broadcastSse:(...args)=>broadcasts.push(args)},ctx);
 try{
  const pairing=mirror.issuePairing(m.id,account.id,true);
  assert.ok(!JSON.stringify(db.query('SELECT * FROM pp_receiver_pairings')).includes(pairing.token));
  const bound=mirror.consumePairing(pairing.token,m.id);assert.equal(bound.receivingAccountId,account.id);
  assert.throws(()=>mirror.consumePairing(pairing.token,m.id),/expired|used/i);
  const expired=mirror.issuePairing(m.id,account.id,false);db.execute('UPDATE pp_receiver_pairings SET expires_at=? WHERE token_hash=?',[new Date(Date.now()-1000).toISOString(),crypto.createHash('sha256').update(expired.token).digest('hex')]);
  assert.throws(()=>mirror.consumePairing(expired.token,m.id),/expired|used/i);
  const device={id:crypto.randomUUID(),merchant_id:m.id};
  db.execute('INSERT INTO android_devices(id,merchant_id,device_name,device_model,signing_key_hash,is_active) VALUES(?,?,?,?,?,1)',[device.id,m.id,'Vivo','Android','test-key']);mirror.bindDevice(device.id,bound);
  const s=sessions.create({merchantId:m.id,receivingAccountId:account.id,orderId:'player-order',amountPaise:10000,status:'ACTIVE',expiresAt:new Date(Date.now()+300000)});
  const input={device,accountId:account.id,source:'ANDROID_OBSERVER',rawText:'Rs 100.00 credited UPI Ref 123456789012',observedAt:new Date(),amountPaise:10000n,bankReference:'123456789012'};
  const first=mirror.record(input);assert.equal(first.matchStatus,'DETECTED');assert.equal(first.paymentId,s.id);
  assert.equal(mirror.record(input).duplicate,true);assert.equal(db.query('SELECT * FROM pp_receiver_events').length,1);
  assert.equal(db.query('SELECT * FROM webhook_deliveries').length,1);
  const callback=JSON.parse(db.queryOne('SELECT payload FROM webhook_deliveries').payload);
  assert.equal(callback.event,'PAYMENT_DETECTED');assert.equal(callback.status,'PENDING');assert.equal(callback.confirmationSource,'OBSERVER_EVIDENCE');assert.equal(callback.completedAt,null);assert.equal(callback.utr,'123456789012');
  assert.notEqual(sessions.findById(s.id).status,'SUCCESS');assert.equal(db.query('SELECT * FROM ledger_transactions').length,0);
  assert.ok(broadcasts.some(args=>args[0]==='platform:merchant:'+m.id));
  assert.throws(()=>mirror.record({...input,accountId:'foreign'}),/bound|account/i);
  db.execute('UPDATE android_devices SET is_active=0 WHERE id=?',[device.id]);assert.throws(()=>mirror.record(input),/inactive|revoked/i);
 }finally{webhookEngine.stop();db.close();}
});

test('shared-UPI collisions and late alerts remain unassigned and never send a credit callback',()=>{
 const db=new Database({inMemory:true});runMigrations(db);
 const merchantRepo=new MerchantRepository(db),accountRepo=new ReceivingAccountRepository(db),sessionRepo=new PaymentSessionRepository(db),a=merchantRepo.getDefault();
 const b=merchantRepo.create({businessName:'Other gaming site',slug:'mirror-other',contactEmail:'other@example.test',contactPhone:'9000000000'}),account=accountRepo.findActiveForMerchant(a.id);
 const other=accountRepo.create({merchantId:b.id,upiId:account.upiId,payeeName:'Other site'});
 const webhookEngine=new WebhookEngine({db,merchantRepo});webhookEngine.retryPending=async()=>[];
 const mirror=createReceivingMirror({broadcastSse(){}},{db,merchantRepo,accountRepo,sessionRepo,webhookEngine});
 try{
  const first=sessionRepo.create({merchantId:a.id,receivingAccountId:account.id,orderId:'first',amountPaise:10000,status:'ACTIVE'});
  const second=sessionRepo.create({merchantId:b.id,receivingAccountId:other.id,orderId:'second',amountPaise:10000,status:'ACTIVE'});
  const result=mirror.record({accountId:account.id,source:'GMAIL',rawText:'bank alert',amountPaise:10000n,observedAt:new Date(),bankReference:'real-alert-reference'});
  assert.equal(result.matchStatus,'AMBIGUOUS');assert.equal(result.paymentId,null);
  assert.equal(db.query('SELECT * FROM webhook_deliveries').length,0);
  const stale=mirror.record({accountId:account.id,source:'GMAIL',rawText:'old bank alert',amountPaise:10000n,observedAt:new Date(Date.now()-86400000),bankReference:'older-reference'});
  assert.equal(stale.matchStatus,'UNMATCHED');assert.notEqual(sessionRepo.findById(first.id).status,'SUCCESS');assert.notEqual(sessionRepo.findById(second.id).status,'SUCCESS');
 }finally{db.close();}
});