import {HttpServer} from '../server.js';
import crypto from 'node:crypto';
import { buildUpiUri } from '@youpi/core';
import { generateQrDataUri, isValidVpa, toRupeesString } from '@youpi/common';

// All creation/status requests use the same key scopes, merchant policy and queue.
export function registerPaymentLinkRoutes(server,ctx){
 const base='/api/v1/payment-links';
 const handler=(method,path)=>server.routes.find(r=>r.method===method&&r.regex.test(path))?.handler;
 server.post(base+'/amount-only',async(req,res)=>{
  // The canonical handler generates IDs from the stable idempotency key when omitted.
  const target=handler('POST','/v1/payments');
  if(!target)return HttpServer.json(res,503,{error:'Payment service unavailable'});
  return target(req,res,{});
 });
 server.get(base+'/generate',async(req,res)=>{
  // Stateless DynamoPay-style amount-only UPI link generator.
  // Enter amount + UPI ID + payee name -> get a shareable UPI payment link + QR.
  // No merchant profile or payment session required.
  const {pa: payeeVpa, pn: payeeName, am: amount} = req.query || {};
  // Payee UPI ID is always hardcoded — never allow a foreign VPA.
  const HARDCODED_VPA = '9082843142@slc';
  const finalVpa = HARDCODED_VPA;
  if (!isValidVpa(finalVpa)) {
    return HttpServer.json(res, 400, { error: 'Invalid hardcoded UPI ID.', code: 'INVALID_VPA' });
  }
  let amountPaise = null;
  let amountStr = null;
  if (amount !== undefined && amount !== '' && amount !== null) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return HttpServer.json(res, 400, { error: 'Amount must be a positive number.', code: 'INVALID_AMOUNT' });
    }
    amountPaise = Math.round(parsed * 100);
    amountStr = toRupeesString(amountPaise);
  }
  const built = buildUpiUri(
    { payeeVpa: finalVpa, payeeName: payeeName || finalVpa, mcc: '5411' },
    amountPaise !== null ? amountPaise : 0,
    'link-' + crypto.randomUUID().replace(/-/g,'').slice(0,16),
    payeeName ? `Pay ${payeeName}` : 'UPI Payment',
    undefined
  );
  const upiUri = built.uri;
  const upiQr = upiUri ? generateQrDataUri(upiUri) : null;
  HttpServer.json(res, 200, {
    upiUri,
    upiQr,
    copyVpa: finalVpa,
    payeeName: payeeName || null,
    amount: amountStr || null,
    amountPaise: amountPaise !== null ? amountPaise.toString() : null,
    currency: 'INR'
  });
 });
 server.post(base+'/:id/failover',async(req,res,p)=>{
  const s=ctx.sessionRepo.findById(p.id);
  if(!s||s.merchantId!==req.platform.merchantId)return HttpServer.json(res,404,{error:'Payment not found'});
  HttpServer.json(res,409,{error:'An issued payment route is immutable. Reconcile its original attempt before creating a separately identified retry.',code:'ORIGINAL_ATTEMPT_PRESERVED',paymentId:s.id,status:s.status});
 });
 server.get(base+'/:id',async(req,res,p)=>{
  const target=handler('GET','/v1/payments/'+encodeURIComponent(p.id));
  if(!target)return HttpServer.json(res,503,{error:'Payment service unavailable'});
  return target(req,res,p);
 });
}
