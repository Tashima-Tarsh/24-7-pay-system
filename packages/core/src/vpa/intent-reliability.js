/**
 * UPI intent preflight and VPA health evidence, additive and read-only.
 * This module never selects a different payee for an existing order, modifies
 * payable amounts, writes to the ledger or declares payment success.
 */
export function validateUpiParameters({vpa, payeeName, amountPaise, transactionReference, note=''} = {}) {
  const errors=[];
  const payee=typeof vpa==='string'?vpa.trim():'';
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,254}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/.test(payee))errors.push('INVALID_VPA_FORMAT');
  if(typeof payeeName!=='string'||!payeeName.trim()||payeeName.trim().length>80||/[\u0000-\u001f\u007f]/.test(payeeName))errors.push('INVALID_PAYEE_NAME');
  const paise=typeof amountPaise==='bigint'?amountPaise:
    typeof amountPaise==='number'&&Number.isSafeInteger(amountPaise)?BigInt(amountPaise):null;
  if(paise===null||paise<=0n)errors.push('INVALID_AMOUNT_PAISE');
  if(typeof transactionReference!=='string'||!transactionReference.trim()||transactionReference.length>35||!/^[A-Za-z0-9]+$/.test(transactionReference))errors.push('INVALID_TRANSACTION_REFERENCE');
  if(typeof note!=='string'||note.length>80||/[\u0000-\u001f\u007f]/.test(note))errors.push('INVALID_TRANSACTION_NOTE');
  return {ok:errors.length===0,errors};
}

function paiseToText(paise){
  const value=typeof paise==='bigint'?paise:BigInt(paise);
  return `${value/100n}.${(value%100n).toString().padStart(2,'0')}`;
}

/**
 * Validate the actual URI a customer receives without reconstructing or
 * replacing it. A syntactically correct intent is not evidence of bank credit.
 */
export function inspectUpiIntent(uri,{expectedVpa,expectedAmountPaise,expectedReference}={}){
  const errors=[];
  if(typeof uri!=='string'||!uri.startsWith('upi://pay?'))return {ok:false,errors:['INVALID_UPI_SCHEME'],proofOfPayment:false};
  let parsed;
  try{parsed=new URL(uri);}catch{return {ok:false,errors:['INVALID_UPI_URI'],proofOfPayment:false};}
  const p=parsed.searchParams,amount=p.get('am'),ref=p.get('tr'),payee=p.get('pa');
  if(!payee||!/^[A-Za-z0-9][A-Za-z0-9._-]{1,254}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/.test(payee))errors.push('INVALID_VPA_FORMAT');
  if(!p.get('pn')?.trim())errors.push('MISSING_PAYEE_NAME');
  if(!amount||!/^\d+\.\d{2}$/.test(amount)||Number(amount)<=0)errors.push('INVALID_AMOUNT');
  if(p.get('cu')!=='INR')errors.push('INVALID_CURRENCY');
  if(!ref||!/^[A-Za-z0-9]{1,35}$/.test(ref))errors.push('INVALID_TRANSACTION_REFERENCE');
  if(expectedVpa!==undefined&&payee!==expectedVpa)errors.push('VPA_MISMATCH');
  if(expectedAmountPaise!==undefined){
    try{
      if(typeof expectedAmountPaise==='number'&&!Number.isSafeInteger(expectedAmountPaise))throw Error();
      if(amount!==paiseToText(expectedAmountPaise))errors.push('AMOUNT_MISMATCH');
    }catch{errors.push('INVALID_EXPECTED_AMOUNT');}
  }
  if(expectedReference!==undefined&&ref!==String(expectedReference).replace(/[^A-Za-z0-9]/g,'').slice(0,35))errors.push('REFERENCE_MISMATCH');
  return {ok:errors.length===0,errors,proofOfPayment:false};
}

/**
 * Metrics must come from authoritative, finalized bank/PSP results only.
 * Unknown/pending/client-reported payments never count as failures/successes.
 * A VPA with no history is UNKNOWN, not 100% healthy.
 */
export function evaluateVpaHealth({merchantId,account,events=[],minimumSample=20,maxFailureRate=0.35}={}){
  if(!merchantId||!account||account.merchantId!==merchantId)return {state:'INELIGIBLE',reason:'MERCHANT_SCOPE_MISMATCH',sampleSize:0,successRate:null};
  if(account.isActive===false||account.status==='BLOCKED'||account.status==='SUSPENDED')return {state:'INELIGIBLE',reason:'ACCOUNT_DISABLED',sampleSize:0,successRate:null};
  if(account.approved!==true)return {state:'INELIGIBLE',reason:'ACCOUNT_NOT_APPROVED',sampleSize:0,successRate:null};
  const unique=new Set();let success=0,failed=0;
  for(const event of events){
    if(event.merchantId!==merchantId||event.accountId!==account.id||event.authoritative!==true)continue;
    if(event.status!=='SUCCESS'&&event.status!=='FAILED')continue;
    if(typeof event.paymentId!=='string'||!event.paymentId||unique.has(event.paymentId))continue;
    unique.add(event.paymentId);
    if(event.status==='SUCCESS')success++;else failed++;
  }
  const sampleSize=success+failed,successRate=sampleSize?success/sampleSize:null;
  if(sampleSize<minimumSample)return {state:'UNKNOWN',reason:'INSUFFICIENT_VERIFIED_HISTORY',sampleSize,successRate};
  return {state:failed/sampleSize>maxFailureRate?'DEGRADED':'OBSERVED_HEALTHY',
    reason:failed/sampleSize>maxFailureRate?'HIGH_VERIFIED_FAILURE_RATIO':'VERIFIED_OUTCOMES_WITHIN_THRESHOLD',
    sampleSize,successRate};
}

/** Only rank explicitly approved same-merchant candidates; no automatic rerouting. */
export function rankEligibleVpas({merchantId,accounts=[],events=[],minimumSample=20}={}){
  return accounts.map(account=>({accountId:account.id,vpa:account.upiId,
    health:evaluateVpaHealth({merchantId,account,events,minimumSample})}))
    .filter(item=>item.health.state!=='INELIGIBLE')
    .sort((a,b)=>{
      const score=x=>x.health.state==='OBSERVED_HEALTHY'?2:x.health.state==='UNKNOWN'?1:0;
      return score(b)-score(a)||
        (b.health.successRate??-1)-(a.health.successRate??-1)||
        String(a.accountId).localeCompare(String(b.accountId));
    });
}
