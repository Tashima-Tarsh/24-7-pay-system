import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '@youpi/db';
import { runMigrations } from '../../../../packages/db/src/migrate.js';
import { initializePlatform } from '../platform/schema.js';
import { activateEligibleMerchant } from '../platform/merchant-activation.js';

function makeDb(status,{verified=true,ownerActive=true,profile={businessName:'Trading Company',contactName:'Merchant Owner',mobile:'919876543210'}}={}){
 const db=new Database({inMemory:true});runMigrations(db);initializePlatform(db);
 const stamp=new Date().toISOString(),mid='test-merchant';
 db.execute('INSERT INTO pp_merchants (merchant_id,status,profile,created_at,updated_at) VALUES (?,?,?,?,?)',[mid,status,JSON.stringify(profile),stamp,stamp]);
 db.execute('INSERT INTO pp_users (id,merchant_id,email,password_hash,role,email_verified,active,created_at) VALUES (?,?,?,?,?,?,?,?)',['test-owner',mid,'verified@example.test','unused','OWNER',verified?1:0,ownerActive?1:0,stamp]);
 return db;
}
test('legacy onboarding becomes ACTIVE after active owner and valid profile without another admin action',()=>{
 for(const status of ['EMAIL_PENDING','PROFILE_INCOMPLETE','APPROVED']){
  const db=makeDb(status);try{
   let calls=0;
   const out=activateEligibleMerchant(db,'test-merchant',{audit:()=>calls++});
   assert.equal(out.active,true);assert.equal(out.changed,true);assert.equal(calls,1);
   assert.equal(db.queryOne('SELECT status FROM pp_merchants WHERE merchant_id=?',['test-merchant']).status,'ACTIVE');
   assert.equal(activateEligibleMerchant(db,'test-merchant').changed,false,'activation is idempotent');
  }finally{db.close();}
 }
});
test('an activated owner can complete onboarding without a second email-verification gate',()=>{
 const db=makeDb('EMAIL_PENDING',{verified:false});
 try{
  const outcome=activateEligibleMerchant(db,'test-merchant');
  assert.equal(outcome.active,true);
  assert.equal(db.queryOne('SELECT status FROM pp_merchants WHERE merchant_id=?',['test-merchant']).status,'ACTIVE');
 }finally{db.close();}
});
test('inactive owner or missing business profile never silently activates merchant payment collection',()=>{
 const cases=[
  {ownerActive:false},
  {profile:{businessName:'Shop',contactName:'',mobile:'919876543210'}},
  {profile:{businessName:'Shop',contactName:'Owner',mobile:'invalid'}}
 ];
 for(const variant of cases){const db=makeDb('EMAIL_PENDING',variant);try{
  assert.equal(activateEligibleMerchant(db,'test-merchant').active,false);
  assert.equal(db.queryOne('SELECT status FROM pp_merchants WHERE merchant_id=?',['test-merchant']).status,'EMAIL_PENDING');
 }finally{db.close();}}
});
test('suspension, rejection and review are never silently overridden by sign-in or payment creation',()=>{
 for(const status of ['SUSPENDED','REJECTED','UNDER_REVIEW']){
  const db=makeDb(status);try{
   const result=activateEligibleMerchant(db,'test-merchant');
   assert.equal(result.active,false);assert.equal(result.reason,'REQUIRES_ADMIN_REVIEW');
   assert.equal(db.queryOne('SELECT status FROM pp_merchants WHERE merchant_id=?',['test-merchant']).status,status);
  }finally{db.close();}
 }
});
test('missing merchant cannot auto-create status, unrelated tenant cannot be affected',()=>{
 const db=makeDb('PROFILE_INCOMPLETE');try{
  assert.equal(activateEligibleMerchant(db,'another-merchant').active,false);
  assert.equal(db.queryOne('SELECT status FROM pp_merchants WHERE merchant_id=?',['test-merchant']).status,'PROFILE_INCOMPLETE');
 }finally{db.close();}
});

test('legacy payment fixtures with only merchant status remain compatible',()=>{
 const db=new Database({inMemory:true});
 try{
  db.execute('CREATE TABLE pp_merchants(merchant_id TEXT PRIMARY KEY,status TEXT)');
  db.execute('INSERT INTO pp_merchants VALUES(?,?)',['legacy-id','ACTIVE']);
  assert.equal(activateEligibleMerchant(db,'legacy-id').active,true);
  assert.equal(activateEligibleMerchant(db,'no-record').reason,'MERCHANT_NOT_FOUND');
 }finally{db.close();}
});
