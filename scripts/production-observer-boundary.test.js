import test from 'node:test';
import assert from 'node:assert/strict';
import { AttributionEngine } from '@youpi/core';

test('production observer with matching UTR cannot complete payment or broadcast success',()=>{
  const old = process.env.NODE_ENV;
  const calls=[];
  const engine = new AttributionEngine({
    sessionRepo:{ findById:()=>{ throw Error('Production reconciliation must not read or settle a session'); }, db:{query:()=>{throw Error('No settlement lookup allowed');}}},
    obsRepo:{
      findByFingerprint:()=>null,
      create:(obs)=>{calls.push('stored');return{id:'obs-test',...obs};},
      markAttributed:()=>{throw Error('No attribution allowed');}
    },
    auditRepo:{ log:(event)=>{calls.push(event.action);} },
    eventEmitter:{ emit:()=>{throw Error('Observer must not broadcast financial success');} }
  });
  try {
    process.env.NODE_ENV='production';
    const result=engine.processObservation({
      source:'GMAIL',fingerprintHash:'fake-observer-123',receivingAccountId:'account',
      amountPaise:50000,bankReferenceNumber:'123456789012'
    });
    assert.equal(result.attributed,false);
    assert.equal(result.outcomeStatus,'VERIFICATION_PENDING');
    assert.deepEqual(calls,['stored','SUPPLEMENTARY_EVIDENCE_RECORDED']);
    assert.equal(engine.reconcilePendingPayment('session'),null);
  } finally {
    if(old===undefined)delete process.env.NODE_ENV;
    else process.env.NODE_ENV=old;
    engine.destroy();
  }
});
