import {useEffect,useState,type FormEvent} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowSquareOut,Check,Copy,LinkSimple,LockKey,Plus,ShieldCheck,SpinnerGap,WarningCircle} from '@phosphor-icons/react';
import {Button} from './components/ui/button';
import {Card} from './components/ui/card';
import {AuthRequired,createPaymentLink,getPaymentReadiness,type PaymentReadiness,type PaymentLinkResponse} from './api';

type CheckoutPreview={status?:string;upiQr?:string;upiUri?:string;upiDeepLinks?:{gpay?:string;phonepe?:string;paytm?:string};payeeVpa?:string;payeeName?:string};
type Props={canCreate:boolean;isPlatform:boolean;onCreated:()=>void;onConfigureUpi:()=>void;compact?:boolean};
function checkoutHref(result:PaymentLinkResponse|null):string|null{
 if(!result)return null;
 // An API-generated UPI payment is always served by this same public gateway.
 // Its configured public hostname can differ from the hostname used in the browser.
 // Use the server-issued payment ID instead of trusting a cross-origin checkout URL.
 const id=result.paymentId;
 if(typeof id==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(id))return '/checkout/'+encodeURIComponent(id);
 if(typeof result.checkoutUrl!=='string'||!result.checkoutUrl.trim())return null;
 try{
  const url=new URL(result.checkoutUrl,window.location.origin);
  if(url.origin!==window.location.origin||!url.pathname.startsWith('/checkout/'))return null;
  return url.pathname+url.search+url.hash;
 }catch{return null;}
}
const inputClass='payment-link-input';

export function PaymentLinkStudio({canCreate,isPlatform,onCreated,onConfigureUpi,compact=false}:Props){
 const [orderId,setOrderId]=useState('ORDER-'+Date.now());
 const [amount,setAmount]=useState('');
 const [loading,setLoading]=useState(false);
 const [result,setResult]=useState<PaymentLinkResponse|null>(null);
 const [checkoutPreview,setCheckoutPreview]=useState<CheckoutPreview|null>(null);
 const [failure,setFailure]=useState('');
 const [copied,setCopied]=useState(false);
 const [attemptKey,setAttemptKey]=useState<string|null>(null);
 const [readiness,setReadiness]=useState<PaymentReadiness|null>(null);
 const [readinessError,setReadinessError]=useState('');
 const [readinessBusy,setReadinessBusy]=useState(false);
 const [readinessVersion,setReadinessVersion]=useState(0);
 useEffect(()=>{
  if(!canCreate||isPlatform)return;
  const controller=new AbortController();
  setReadinessBusy(true);
  getPaymentReadiness(controller.signal).then(value=>{
   if(!controller.signal.aborted){setReadiness(value);setReadinessError('');}
  }).catch(error=>{
   if(!controller.signal.aborted)setReadinessError(error instanceof Error?error.message:'Payment setup status unavailable');
  }).finally(()=>{if(!controller.signal.aborted)setReadinessBusy(false)});
  return()=>controller.abort();
 },[canCreate,isPlatform,readinessVersion]);
 useEffect(()=>{
  const id=result?.paymentId;
  if(!id||!/^[A-Za-z0-9-]{1,128}$/.test(id))return;
  const controller=new AbortController();
  const load=async()=>{
   try{
    const response=await fetch('/api/v1/checkout/'+encodeURIComponent(id)+'/state',{signal:controller.signal,cache:'no-store',credentials:'omit'});
    if(!response.ok)return;
    const preview=await response.json() as CheckoutPreview;
    if(!controller.signal.aborted)setCheckoutPreview(preview);
   }catch{}
  };
  void load();
  return()=>controller.abort();
 },[result?.paymentId]);
 const reduce=useReducedMotion();
 // Readiness is advisory: a failed diagnostic must never disable a valid payment API request.
 const canSubmit=canCreate&&!isPlatform&&!loading;
 const href=checkoutHref(result);
 const total=Number(amount);
 const validAmount=/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)&&Number.isFinite(total)&&total>0;
 const validOrder=/^[-A-Za-z0-9_]{1,120}$/.test(orderId);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!canSubmit)return;
  if(!validOrder||!validAmount){setFailure('Enter a valid order reference and an amount greater than ₹0, with up to two decimal places.');return;}
  setLoading(true);setFailure('');setResult(null);setCheckoutPreview(null);setCopied(false);
  // Maintain one idempotency key across explicit retry attempts for an unchanged request.
  const key=attemptKey||crypto.randomUUID();
  if(!attemptKey)setAttemptKey(key);
  try{
   const created=await createPaymentLink({orderId,amount,currency:'INR'},key);
   setResult(created);setAttemptKey(null);
   onCreated();
  }catch(error){
   setFailure(error instanceof AuthRequired?'Your session expired. Sign in again in the merchant workspace.':error instanceof Error?error.message:'Payment request could not be created.');
  }finally{setLoading(false);}
 }
 function updateOrder(value:string){setOrderId(value);setAttemptKey(null);setResult(null);setCheckoutPreview(null);setFailure('');}
 function updateAmount(value:string){setAmount(value);setAttemptKey(null);setResult(null);setFailure('');}
 async function copy(){
  if(!href)return;
  try{await navigator.clipboard.writeText(new URL(href,window.location.origin).href);setCopied(true);}
  catch{setFailure('Clipboard access is unavailable. Open the checkout link and copy it from the address bar.');}
 }
 // Payable hand-off targets come from the backend-issued session; never reconstructed here.
 const payLinks=(checkoutPreview?.upiDeepLinks||null) as {gpay?:string;phonepe?:string;paytm?:string;bhim?:string}|null;
 const anyUpiUri=checkoutPreview?.upiUri||null;
 const payableNow=Boolean(checkoutPreview&&['ACTIVE','INTENT_ISSUED'].includes(checkoutPreview.status||'')&&(anyUpiUri||payLinks));
 const payTargets:[string,string|undefined][]=[['Open any UPI app',anyUpiUri||undefined],['Google Pay',payLinks?.gpay],['PhonePe',payLinks?.phonepe],['Paytm',payLinks?.paytm],['BHIM',payLinks?.bhim]];
 const blocked=isPlatform?'Payment creation is available to merchant accounts. Platform operators can inspect merchants but cannot create an order on their behalf.':'Your account requires the payments.create permission to generate checkout links.';
 return <Card className={'payment-link-studio'+(compact?' compact':'')}>
  <div className="link-studio-heading"><div><span className="micro">LIVE CHECKOUT INFRASTRUCTURE</span><h2>Create a payment link<span className="heading-period">.</span></h2>
   <p>Build a real UPI checkout in seconds. The payment engine, receiving account and confirmation flow remain exactly as configured.</p></div>
   <span className="link-studio-emblem"><LinkSimple size={23} weight="duotone" aria-hidden="true"/></span>
  </div>
  {!canCreate||isPlatform?<div role="status" className="payment-permission-note"><LockKey size={20} aria-hidden="true"/><span>{blocked} Sign in with a merchant owner or authorized team account.</span></div>:
  <form onSubmit={submit} className="payment-link-form">
   <div className="payment-readiness" aria-live="polite">
    <div className="payment-readiness-header"><strong>Payment-link readiness</strong><button type="button" onClick={()=>setReadinessVersion(v=>v+1)} disabled={readinessBusy}> {readinessBusy?'Checking…':'Check again'} </button></div>
    {readinessError&&<p role="alert">Could not check payment setup: {readinessError}. You can retry without creating a new order.</p>}
    {readiness?.ready&&<p className="payment-readiness-ready">Ready to create · Receiving UPI: <strong>{readiness.account?.upiId||'Configured'}</strong></p>}
    {readiness&&!readiness.ready&&<div className="payment-readiness-issues">{readiness.issues.map(issue=><div className="payment-readiness-issue" key={issue.code}><WarningCircle size={17} aria-hidden="true"/><span>{issue.message}</span>{issue.action==='ADD_RECEIVING_UPI'&&<button type="button" onClick={onConfigureUpi}>Add receiving UPI ID</button>}</div>)}</div>}
   </div>
   <div className="form-fields">
    <label className="payment-field"><span>Order reference</span><input className={inputClass} name="orderId" value={orderId} onChange={e=>updateOrder(e.target.value)} autoComplete="off" maxLength={120} required pattern="[-A-Za-z0-9_]{1,120}" aria-invalid={!validOrder&&orderId.length>0}/><small>Unique reference for your order</small></label>
    <label className="payment-field"><span>Amount (INR)</span><div className="amount-input-wrap"><span className="currency-mark">₹</span><input className={inputClass} name="amount" inputMode="decimal" placeholder="500.00" value={amount} onChange={e=>updateAmount(e.target.value)} autoComplete="off" required aria-invalid={Boolean(amount&&!validAmount)}/></div><small>Exact payable amount, with up to 2 decimals</small></label>
   </div>
   <div className="link-creation-row"><Button className="apple-action-button" type="submit" disabled={!canSubmit||!validAmount||!validOrder}>{loading?<SpinnerGap size={18} className="spin" aria-hidden="true"/>:<Plus size={18} weight="bold" aria-hidden="true"/>}{loading?'Creating checkout…':'Create payment link'}</Button><span className="link-creation-note"><ShieldCheck size={16} weight="fill" aria-hidden="true"/>No manual success override</span></div>
   {failure&&<div className="payment-form-error" role="alert"><WarningCircle size={18} aria-hidden="true"/>{failure}</div>}
   {result&&<motion.div initial={reduce?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.3}} className="created-link-result" aria-live="polite">
    <div className="result-top"><div className="result-check"><Check size={20} weight="bold" aria-hidden="true"/></div><div><strong>Payment request created</strong><p>Order: {result.orderId||orderId} · Status: {result.status||'Pending confirmation'}</p></div></div>
    {href?<><div className="payment-link-display"><span>{new URL(href,window.location.origin).href}</span><button type="button" onClick={copy} className="copy-link-button" aria-label="Copy checkout link">{copied?<Check size={18}/>:<Copy size={18}/>}</button></div><div className="link-result-actions"><a className="checkout-open-button" href={href}>Open real UPI checkout <ArrowSquareOut size={18}/></a><button className="soft-copy-button" type="button" onClick={copy}>{copied?'Copied ✓':'Copy payment link'}</button></div>{checkoutPreview&&['ACTIVE','INTENT_ISSUED'].includes(checkoutPreview.status||'')&&checkoutPreview.upiQr?.startsWith('data:image/svg+xml;base64,')&&<div className="payment-preview"><div className="payment-preview-qr"><img src={checkoutPreview.upiQr} alt="Scannable UPI payment QR code" width={196} height={196}/></div><div><strong>Scan to pay</strong><p>{checkoutPreview.payeeName||'Merchant'} · {checkoutPreview.payeeVpa||'Receiving account'}</p><p>Use a second device to scan, or open the checkout to pay using an app installed on this phone.</p></div></div>}
    {payableNow&&<div className="upi-app-handoff"><span className="micro">PAY ON THIS DEVICE</span><div className="upi-app-grid">{payTargets.filter(t=>Boolean(t[1])).map(t=><a key={t[0]} href={t[1]} className="upi-app-tile" rel="noreferrer"><span>{t[0]}</span><ArrowSquareOut size={15} weight="bold" aria-hidden="true"/></a>)}</div><p className="fineprint">Each button opens the payment request in that app. Enter your UPI PIN there. Confirmation comes only from the authorized provider event, never from returning to this page.</p></div>}
    {checkoutPreview?.status==='QUEUED'&&<p className="payment-link-help" role="status">Your payment request is queued. The QR and UPI app buttons appear once the receiving account is ready; the checkout link can be shared now.</p>}
    <p className="payment-link-help">The customer checkout opens supported UPI app intents and a payment QR when the backend has issued an active UPI session. App return is not credit confirmation.</p></>:
    <p className="payment-form-error">The backend created your payment request but did not return a usable payment identifier or checkout URL. Check the order in Transactions rather than generating a duplicate payment.</p>}
   </motion.div>}
  </form>}
  <div className="link-studio-bottom"><div><span className="link-process-number">01</span><strong>Create</strong><small>Order + amount</small></div><div><span className="link-process-number">02</span><strong>Share</strong><small>QR or UPI intent</small></div><div><span className="link-process-number">03</span><strong>Confirm</strong><small>Authorized provider event</small></div></div>
 </Card>;
}
