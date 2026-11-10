export type User={email?:string;role?:string;platform?:boolean;merchantId?:string;permissions?:string[]};
export type KPIs={transactions?:number;confirmed?:number;pending?:number;failed?:number;confirmedPaise?:string|number;confirmationRate?:number};
export type Transaction={id:string;order_id?:string;amount_paise?:number;status?:string;created_at?:string;method?:string;merchant_id?:string};
export type Delivery={id:string;event_type?:string;source?:string;is_successful?:boolean;attempt_count?:number;response_status?:number;next_retry_at?:string};
export const SESSION_KEY='247pay-new-workspace-session';
export class AuthRequired extends Error{}
export async function get<T>(route:string,signal?:AbortSignal):Promise<T>{
 const token=sessionStorage.getItem(SESSION_KEY);if(!token)throw new AuthRequired('Sign in to your merchant workspace first.');
 const response=await fetch('/api/platform/v1'+route,{credentials:'omit',cache:'no-store',signal,headers:{Authorization:'Bearer '+token}});
 if(response.status===401){sessionStorage.removeItem(SESSION_KEY);throw new AuthRequired('Your session has expired.');}
 const body:unknown=await response.json().catch(()=>null);
 if(!response.ok)throw new Error((body&&typeof body==='object'&&'message'in body?String(body.message):'Unable to load the selected workspace data')+' ('+response.status+')');
 return body as T;
}
export type PaymentReadiness={
 ready:boolean;
 issues:Array<{code:string;message:string;action:'ADD_RECEIVING_UPI'|'MERCHANT_ONBOARDING'|'UPI_CHANNEL_SETTINGS'|string}>;
 account:{upiId:string;payeeName:string}|null;
 merchantStatus:string;
 maxAmountPaise:number;
};
export function getPaymentReadiness(signal?:AbortSignal):Promise<PaymentReadiness>{
 return get<PaymentReadiness>('/payment-readiness',signal);
}
export type PaymentLinkResponse={paymentId?:string;orderId?:string;amount?:number|string;status?:string;checkoutUrl?:string};
export type PaymentLinkRequest={orderId:string;amount:string;currency:'INR'};
export async function createPaymentLink(input:PaymentLinkRequest,idempotencyKey:string):Promise<PaymentLinkResponse>{
 const token=sessionStorage.getItem(SESSION_KEY);
 if(!token)throw new AuthRequired('Sign in before creating a payment link.');
 const response=await fetch('/api/platform/v1/payments',{
  method:'POST',credentials:'omit',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
  body:JSON.stringify(input)
 });
 const payload:unknown=await response.json().catch(()=>null);
 if(response.status===401){sessionStorage.removeItem(SESSION_KEY);throw new AuthRequired('Session expired.');}
 if(!response.ok)throw new Error(payload&&typeof payload==='object'&&'error'in payload?String(payload.error):payload&&typeof payload==='object'&&'message'in payload?String(payload.message):'Payment could not be created ('+response.status+').');
 if(!payload||typeof payload!=='object')throw new Error('Payment API returned an unexpected response. Check Transactions before retrying.');
 return payload as PaymentLinkResponse;
}
export async function signIn(email:string,password:string):Promise<void>{
 const response=await fetch('/api/platform/v1/login',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','x-247-auth-mode':'bearer'},body:JSON.stringify({email,password})});
 const payload:unknown=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(payload&&typeof payload==='object'&&'error'in payload?String(payload.error):'Invalid credentials');
 if(!payload||typeof payload!=='object'||!('sessionToken'in payload)||typeof payload.sessionToken!=='string'||!('user'in payload))throw new Error('Could not establish an authenticated workspace session.');
 sessionStorage.setItem(SESSION_KEY,payload.sessionToken);
}
export async function registerMerchantAccount(data:{businessName:string;contactName:string;mobile:string;email:string;password:string}):Promise<void>{
 const response=await fetch('/api/platform/v1/register',{
  method:'POST',credentials:'omit',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
 });
 const payload:unknown=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(payload&&typeof payload==='object'&&'error'in payload?String(payload.error):'Unable to register your merchant account ('+response.status+').');
 if(!payload||typeof payload!=='object'||!('merchantId'in payload)||!('status'in payload)||payload.status!=='ACTIVE')throw new Error('Merchant registration did not return an active account.');
}
export async function switchWorkspaceAccount():Promise<void>{
 const token=sessionStorage.getItem(SESSION_KEY);
 try{
  if(token)await fetch('/api/platform/v1/logout',{
   method:'POST',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:'{}'
  });
 }finally{sessionStorage.removeItem(SESSION_KEY);}
}
export type PlatformMerchant={merchant_id:string;status:string;profile?:{businessName?:string;contactName?:string;mobile?:string}};
export type StaffUser={id:string;email:string;role:string;active:boolean};
export async function adminCreateMerchant(data:{businessName:string;contactName:string;mobile:string;email:string}):Promise<{businessName:string;merchantId:string;invitationSent?:boolean}>{
 const token=sessionStorage.getItem(SESSION_KEY);if(!token)throw new AuthRequired('Please sign in.');
 const response=await fetch('/api/platform/v1/merchants',{
  method:'POST',credentials:'omit',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(data)
 });
 const payload:unknown=await response.json().catch(()=>null);
 if(response.status===401){sessionStorage.removeItem(SESSION_KEY);throw new AuthRequired('Session expired.');}
 if(!response.ok)throw new Error(payload&&typeof payload==='object'&&'error'in payload?String(payload.error):'Could not create merchant ('+response.status+')');
 if(!payload||typeof payload!=='object')throw new Error('Merchant response was invalid');
 return payload as {businessName:string;merchantId:string;invitationSent?:boolean};
}
export async function adminInviteStaff(data:{email:string;role:string}):Promise<void>{
 const token=sessionStorage.getItem(SESSION_KEY);if(!token)throw new AuthRequired('Please sign in.');
 const res=await fetch('/api/platform/v1/staff/invite',{
  method:'POST',credentials:'omit',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(data)
 });
 const body:unknown=await res.json().catch(()=>null);
 if(res.status===401){sessionStorage.removeItem(SESSION_KEY);throw new AuthRequired('Session expired.');}
 if(!res.ok)throw new Error(body&&typeof body==='object'&&'error'in body?String(body.error):'Could not send invitation ('+res.status+')');
}
export type ReceivingAccount={
 id:string;merchantId:string;upiId:string;payeeName:string;isActive:boolean;
 isMerchantEnabled:boolean;isSlotBusy?:boolean;currentActiveSessionId?:string|null;
 dailyTxnCount?:number;dailyVolumePaise?:number;
 bankDetails?:{bankName:string;accountHolderName:string;accountNumberMasked:string;ifsc:string}|null
};
async function writeMerchantAccount<T>(path:string,input:unknown):Promise<T>{
 const token=sessionStorage.getItem(SESSION_KEY);
 if(!token)throw new AuthRequired('Sign in to manage receiving accounts.');
 const response=await fetch('/api/platform/v1'+path,{
   method:'POST',credentials:'omit',cache:'no-store',
   headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(input)
 });
 const payload:unknown=await response.json().catch(()=>null);
 if(response.status===401){sessionStorage.removeItem(SESSION_KEY);throw new AuthRequired('Session expired. Sign in again.');}
 if(!response.ok)throw new Error(
  payload&&typeof payload==='object'&&'error'in payload?String(payload.error):
  'Receiving account request failed ('+response.status+').'
 );
 return payload as T;
}
export function addReceivingUpi(upiId:string,payeeName:string,confirmVpaOwnership:boolean):Promise<{account:ReceivingAccount}>{
 return writeMerchantAccount('/receiving-accounts',{upiId,payeeName,confirmVpaOwnership});
}
export function setReceivingUpiActive(id:string,active:boolean):Promise<{account:ReceivingAccount}>{
 if(!/^[A-Za-z0-9-]{1,128}$/.test(id))throw new Error('Invalid account identifier');
 return writeMerchantAccount('/receiving-accounts/'+encodeURIComponent(id)+'/state',{active});
}
export function money(paise:string|number|undefined){const n=Number(paise||0)/100;return Number.isFinite(n)?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n):'—';}
export function number(n:number|undefined){return new Intl.NumberFormat('en-IN').format(n||0);}
export function date(raw?:string){if(!raw)return'—';const d=new Date(raw);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}
