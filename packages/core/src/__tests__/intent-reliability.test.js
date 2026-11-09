import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectUpiIntent,validateUpiParameters,evaluateVpaHealth,rankEligibleVpas} from '../vpa/intent-reliability.js';
import {buildUpiUri} from '../upi-intent-builder.js';

const profile={payeeVpa:'merchant@okbank',payeeName:'Merchant Store',mcc:'5411'};
test('actual UPI URI matches original receiving VPA, amount and reference',()=>{
 const uri=buildUpiUri(profile,50001n,'ORDER-ABC-001','Order payment').uri;
 assert.deepEqual(inspectUpiIntent(uri,{expectedVpa:profile.payeeVpa,expectedAmountPaise:50001n,expectedReference:'ORDER-ABC-001'}),{ok:true,errors:[],proofOfPayment:false});
});
test('preflight rejects tampered or malformed intent without asserting payment success',()=>{
 const uri=buildUpiUri(profile,10000n,'TX-1','Payment').uri;
 for(const [alter,reason] of [
  [uri.replace('am=100.00','am=100.99'),'AMOUNT_MISMATCH'],
  [uri.replace('pa=merchant%40okbank','pa=fraud%40okbank'),'VPA_MISMATCH'],
  [uri.replace('tr=TX1','tr=OTHER'),'REFERENCE_MISMATCH'],
  [uri.replace('cu=INR','cu=USD'),'INVALID_CURRENCY']
 ])assert.ok(inspectUpiIntent(alter,{expectedVpa:profile.payeeVpa,expectedAmountPaise:10000n,expectedReference:'TX-1'}).errors.includes(reason),reason);
 assert.deepEqual(inspectUpiIntent('https://untrusted.example/pay'),{ok:false,errors:['INVALID_UPI_SCHEME'],proofOfPayment:false});
});
test('validator rejects floating amounts, control characters and bad order notes',()=>{
 assert.equal(validateUpiParameters({vpa:'merchant@okbank',payeeName:'Shop',amountPaise:101n,transactionReference:'ORDER123'}).ok,true);
 assert.ok(validateUpiParameters({vpa:'bad vpa',payeeName:'\n',amountPaise:1.5,transactionReference:'A B',note:'x\u0000'}).errors.length>=4);
});
test('no history is unknown, not an invented 100 percent approval score',()=>{
 const account={id:'a',merchantId:'m1',upiId:'merchant@okbank',approved:true,isActive:true};
 const result=evaluateVpaHealth({merchantId:'m1',account});
 assert.equal(result.state,'UNKNOWN');assert.equal(result.successRate,null);assert.equal(result.sampleSize,0);
});
test('only unique authoritative finalized same-merchant payments count',()=>{
 const account={id:'a',merchantId:'m1',upiId:'merchant@okbank',approved:true,isActive:true};
 const events=[
  {merchantId:'m1',accountId:'a',paymentId:'p1',authoritative:true,status:'SUCCESS'},
  {merchantId:'m1',accountId:'a',paymentId:'p1',authoritative:true,status:'SUCCESS'},
  {merchantId:'m1',accountId:'a',paymentId:'p2',authoritative:true,status:'FAILED'},
  {merchantId:'m2',accountId:'a',paymentId:'p3',authoritative:true,status:'FAILED'},
  {merchantId:'m1',accountId:'a',paymentId:'p4',authoritative:false,status:'SUCCESS'},
  {merchantId:'m1',accountId:'a',paymentId:'p5',authoritative:true,status:'PENDING'}
 ];
 const h=evaluateVpaHealth({merchantId:'m1',account,events,minimumSample:2});
 assert.equal(h.state,'DEGRADED');assert.equal(h.sampleSize,2);assert.equal(h.successRate,0.5);
});
test('candidate ranking never crosses merchants or includes disabled/unapproved VPAs',()=>{
 const account={id:'a',upiId:'one@okbank',merchantId:'m1',approved:true,isActive:true};
 const ranked=rankEligibleVpas({merchantId:'m1',accounts:[account,{...account,id:'b',merchantId:'m2'}, {...account,id:'c',approved:false}, {...account,id:'d',isActive:false}]});
 assert.deepEqual(ranked.map(x=>x.accountId),['a']);
});
