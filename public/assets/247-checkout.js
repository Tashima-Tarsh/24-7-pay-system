const $=id=>document.getElementById(id);
const found=location.pathname.match(/^\/checkout\/([^/]+)\/?$/);
const paymentId=found?decodeURIComponent(found[1]):new URLSearchParams(location.search).get('id');
const android=/Android/i.test(navigator.userAgent);
const mobile=android||/iPhone|iPad|iPod/i.test(navigator.userAgent);
let current=null,events=null,polling=null,loading=false,terminal=false,deadline=0,retryTimer=null,appHandoff=false;
const terminalStates=new Set(['SUCCESS','FAILED','EXPIRED','CANCELLED','BLOCKED']);
const safeUri=(url,prefix)=>typeof url==='string'&&url.startsWith(prefix)&&!(/[\s\u0000-\u001f]/.test(url))?url:null;
const rupees=value=>{const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n):'—';};
function display(id,value){$(id).textContent=String(value??'—');}
function statusLine(title,description,kind=''){
 const box=document.querySelector('.status-box');box.className='status-box'+(kind?' '+kind:'');
 display('status-title',title);display('status-description',description);
}
function stop(){if(events){events.close();events=null;}if(polling){clearInterval(polling);polling=null;}if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}}
function externalReturn(url){
 const a=$('merchant-return');a.hidden=true;a.removeAttribute('href');
 try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password){a.href=u.href;a.hidden=false;}}catch{}
}
function hidePayment(){
 $('payment-instructions').hidden=true;$('qr').hidden=true;$('qr').removeAttribute('src');
 for(const id of ['upi-open','gpay-open','phonepe-open','paytm-open','bhim-open'])$(id).removeAttribute('href');
 $('app-actions').hidden=true;$('timer').hidden=true;
}
function sessionDescription(data){
 const status=String(data.status||'UNKNOWN').toUpperCase();
 if(status==='QUEUED'||status==='INITIATED')return['Your payment is being prepared','A payment slot is not ready yet. Please wait for the correct receiving details.',''];
 if(status==='ACTIVE'||status==='INTENT_ISSUED')return['Ready when you are','Check the payee and amount, then complete the transfer in your own UPI app.',''];
 if(status==='PROCESSING'||status==='VERIFYING'||status==='VERIFICATION_PENDING')return['Checking payment confirmation','Your order is being verified. Please do not make another payment while this is pending.','warning'];
 if(status==='SUCCESS')return['Payment confirmed','The merchant payment has been independently confirmed by the connected payment system.','success'];
 if(status==='FAILED')return['Payment could not be completed','This payment was not confirmed. Please contact your merchant before trying again.','failed'];
 if(status==='EXPIRED')return['This payment link has expired','Please ask your merchant for a fresh payment request.','warning'];
 if(status==='CANCELLED')return['Payment cancelled','This order is no longer accepting payments.','warning'];
 if(status==='BLOCKED')return['Payment unavailable','This session is not available. Contact your merchant for assistance.','failed'];
 return['Checking payment status','We’re checking the latest information about your order.',''];
}
function showResult(data,title,message,kind){
 $('result-panel').hidden=false;
 const icon=$('result-icon');icon.className='result-icon'+(kind?' '+kind:'');
 icon.textContent=data.status==='SUCCESS'?'✓':kind==='failed'?'×':'!';
 display('result-title',title);display('result-description',message);
 const details=data.upiDetails||{};
 const utr=details.utr||details.upiTransactionId||data.utr||null;
 $('reference-details').hidden=!(data.status==='SUCCESS'&&utr);
 if(utr)display('utr',utr);
 externalReturn(data.returnUrl);
}
function render(data){
 if(!data||typeof data!=='object')return;
 current=data;
 const status=String(data.status||'UNKNOWN').toUpperCase();
 terminal=terminalStates.has(status)||data.isTerminal===true;
 document.title=(data.orderId||'Checkout')+' · 24/7 Pay';
 display('merchant-name',data.merchantName||'Your merchant');
 display('order-reference',data.orderId||data.paymentId||paymentId);
 display('amount',rupees(data.amount));
 const [title,description,kind]=sessionDescription({...data,status});
 statusLine(title,description,kind);
 $('loading').hidden=true;$('checkout-content').hidden=false;
 $('result-panel').hidden=true;$('retry-area').hidden=true;
 hidePayment();
 if(data.supportEmails&&data.supportEmails[0]){
  const support=String(data.supportEmails[0]);
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support))display('support','Questions? Contact '+support);
 }
 if(terminal){appHandoff=false;showResult({...data,status},title,description,kind);stop();return;}
 const verifiedUpi=safeUri(data.upiUri,'upi://pay?');
 const uriPayee=verifiedUpi?new URL(verifiedUpi).searchParams.get('pa'):null;
 const payeeVpa=typeof data.payeeVpa==='string'&&data.payeeVpa?data.payeeVpa:uriPayee;
 const payable=(status==='ACTIVE'||status==='INTENT_ISSUED')&&Boolean(verifiedUpi)&&Boolean(payeeVpa);
 if(!payable&&(status==='ACTIVE'||status==='INTENT_ISSUED')){
  statusLine('UPI details unavailable','The receiving UPI ID is not ready for this order. Ask your merchant to verify the assigned account.','warning');
  $('retry-area').hidden=false;
  display('retry-message','Do not pay until the correct QR and receiving UPI ID appear.');
 }
 if(payable){
  $('retry-area').hidden=true;
  $('payment-instructions').hidden=false;
  display('payee-name',data.payeeName||data.merchantName||'Merchant');
  display('payee-vpa',payeeVpa);
  const qr=data.upiQr;
  if(typeof qr==='string'&&qr.startsWith('data:image/svg+xml;base64,')){
   $('qr').src=qr;$('qr').hidden=false;$('qr-fallback').hidden=true;
  }else{
   $('qr-fallback').hidden=false;
   // Recover the QR from the existing authenticated-by-session checkout endpoint
   // only while this payment remains payable. Never display an old QR on expiry.
   const activeId=paymentId;
   fetch('/api/v1/checkout/'+encodeURIComponent(activeId)+'/upi-qr',{cache:'no-store',credentials:'omit'})
    .then(r=>r.ok?r.json():null).then(q=>{
      if(!q||!current||current.status!==status||terminal)return;
      if(typeof q.upiQr==='string'&&q.upiQr.startsWith('data:image/svg+xml;base64,')){
        $('qr').src=q.upiQr;$('qr').hidden=false;$('qr-fallback').hidden=true;
      }
    }).catch(()=>{});
  }
  const links=data.upiDeepLinks||{};
  const query=verifiedUpi.slice('upi://pay?'.length).replace(/mode=04/g,'mode=02');
  // Fallback URL: GPay/PhonePe redirect here after payment so checkout can poll status.
  const fallbackUrl=encodeURIComponent(location.origin+location.pathname);
  const androidIntent=pkg=>'intent://pay?'+query+'#Intent;scheme=upi;package='+pkg+';S.browser_fallback_url='+fallbackUrl+';end';
  const iosUri=scheme=>scheme+query;
  const sources=[
    ['upi-open',verifiedUpi,'upi://pay?'],
    ['gpay-open',android?(safeUri(links.gpay,'intent://pay?')||androidIntent('com.google.android.apps.nbu.paisa.user')):iosUri('gpay://upi/pay?'),android?'intent://pay?':'gpay://upi/pay?'],
    ['phonepe-open',android?(safeUri(links.phonepe,'intent://pay?')||androidIntent('com.phonepe.app')):iosUri('phonepe://upi/pay?'),android?'intent://pay?':'phonepe://upi/pay?'],
    ['paytm-open',android?(safeUri(links.paytm,'intent://pay?')||androidIntent('net.one97.paytm')):iosUri('paytmmp://pay?'),android?'intent://pay?':'paytmmp://pay?'],
    ['bhim-open',android?androidIntent('in.org.npci.upiapp'):iosUri('bhim://upi/pay?'),android?'intent://pay?':'bhim://upi/pay?']
  ];
  if(mobile){
    $('app-actions').hidden=false;
    const intentById={};
    for(const [id,url,prefix] of sources){
      const el=$(id),allowed=safeUri(url,prefix);
      if(allowed){
        el.href=allowed;
        intentById[id]=allowed;
        el.hidden=false;
      } else {
        el.hidden=true;
        el.removeAttribute('href');
      }
    }
    // Explicit per-button click handlers guarantee a user-gesture navigation
    // to the intent URI. Android Chrome does not always honor intent:// in
    // plain <a href> on its own; an explicit location.href inside a click
    // handler (triggered by the user's tap) works reliably.
    for(const [id] of sources){
      const el=$(id);
      if(!el||!intentById[id])continue;
      el.addEventListener('click',function(ev){
        ev.preventDefault();
        const uri=intentById[this.id];
        if(uri){
          appHandoff=true;
          display('app-handoff-note','Complete the payment in your UPI app, then return here. Awaiting verified bank/provider confirmation; do not pay twice.');
          location.href=uri;
        }
      },{passive:false});
    }
    if(appHandoff){
      display('app-handoff-note','UPI app opened or selected. Return here after payment; waiting for trusted confirmation. Do not pay twice.');
    }
  }
  if(data.timeRemainingSeconds>0){
    deadline=Date.now()+Math.min(86400,Number(data.timeRemainingSeconds))*1000;
    $('timer').hidden=false;updateTimer();
  }
 }
}
function updateTimer(){
 if($('timer').hidden)return;
 const t=Math.max(0,Math.ceil((deadline-Date.now())/1000));
 display('time-left',Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s');
 if(t<=0){hidePayment();statusLine('Checking whether your link expired','The time window ended. We’re getting the authoritative status.','warning');void refresh();}
}
async function refresh(){
 if(loading||terminal||!paymentId)return;
 loading=true;
 try{
  const res=await fetch('/api/v1/checkout/'+encodeURIComponent(paymentId)+'/state',{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
  if(!res.ok){if(res.status===404)throw Error('This payment link could not be found. Please check the link with the merchant.');throw Error('The payment service is not responding.');}
  render(await res.json());
 }catch(err){
  hidePayment();
  if(!current){$('loading').hidden=true;$('checkout-content').hidden=false;display('amount','—');display('order-reference',paymentId);display('merchant-name','Your merchant');}
  statusLine('Connection needs attention','We cannot safely show payment instructions until the current status is available.','warning');
  $('retry-area').hidden=false;display('retry-message',err.message||'Could not load payment details.');
 }finally{loading=false;}
}
function connect(){
 if(terminal||!paymentId)return;
 try{
  events=new EventSource('/api/v1/checkout/'+encodeURIComponent(paymentId)+'/events');
  for(const name of ['initial_state','status_change','payment_update','connected'])events.addEventListener(name,()=>void refresh());
  events.onerror=()=>{if(events){events.close();events=null;}if(!terminal)retryTimer=setTimeout(connect,6000);};
 }catch{retryTimer=setTimeout(connect,6000);}
}
// App-button clicks launch an external app; they never authorize settlement.
$('app-actions').addEventListener('click',event=>{
 const target=event.target instanceof Element?event.target.closest('a[href]'):null;
 if(!target||!$('app-actions').contains(target)||!current||terminal)return;
 appHandoff=true;
 display('app-handoff-note','Complete the payment in your UPI app, then return here. Awaiting verified bank/provider confirmation; do not pay twice.');
});
function refreshAfterAppReturn(){
 if(appHandoff&&!terminal&&document.visibilityState==='visible')void refresh();
}
document.addEventListener('visibilitychange',refreshAfterAppReturn);
window.addEventListener('pageshow',refreshAfterAppReturn);
window.addEventListener('focus',refreshAfterAppReturn);
$('copy-vpa').addEventListener('click',async()=>{if(!current?.payeeVpa)return;try{await navigator.clipboard.writeText(current.payeeVpa);$('copy-vpa').textContent='Copied';setTimeout(()=>$('copy-vpa').textContent='Copy UPI ID',1800);}catch{$('copy-vpa').textContent='Select and copy';}});
$('retry').addEventListener('click',refresh);
if(!paymentId){$('loading').hidden=true;$('checkout-content').hidden=false;hidePayment();statusLine('Payment link missing','Please use the payment link shared by your merchant.','failed');}
else{void refresh();connect();polling=setInterval(()=>{updateTimer();void refresh();},3000);}
