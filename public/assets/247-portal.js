const API='/api/platform/v1',KEY='247pay-new-workspace-session';
const $=x=>document.getElementById(x);
let token=sessionStorage.getItem(KEY)||'',user=null,current='overview',renderVersion=0,stream=null,heartbeat=null;
let selectedMerchantId='',merchantDirectory=[];
const scopedEndpoints=['/receiving-accounts','/api-keys','/api-usage','/integration-readiness','/webhook-deliveries','/settings'];
function withMerchantScope(path){
 if(!user?.platform)return path;
 const base=path.split('?')[0];
 if(!scopedEndpoints.some(p=>base===p||base.startsWith(p+'/')))return path;
 if(!selectedMerchantId)throw Error('Select a merchant from the account selector first.');
 const url=new URL(API+path,location.origin);url.searchParams.set('merchantId',selectedMerchantId);
 return url.pathname.slice(API.length)+url.search;
}
async function loadMerchants(){
 if(!user?.platform)return;
 const data=await api('/merchants?limit=100'),select=$('merchant-scope');
 merchantDirectory=data.merchants||[];
 select.replaceChildren(new Option('All merchants',''));
 for(const m of merchantDirectory)select.add(new Option((m.profile?.businessName||'Merchant')+' · '+m.merchant_id,m.merchant_id));
 if(!merchantDirectory.some(m=>m.merchant_id===selectedMerchantId))selectedMerchantId='';
 select.value=selectedMerchantId;
}
const titles={overview:['YOUR WORKSPACE','A clearer view of your day.','Real activity from your account. No sample transactions.'],payments:['PAYMENTS','Every order, easier to find.','Follow orders and understand their status.'],merchants:['PLATFORM','Your merchants, at a glance.','Businesses available to your platform role.'],operations:['OPERATIONS','Know what needs attention.','Provider connections, callbacks and operating health.'],verification:['PAYMENT VERIFICATION','Check the money trail.','Review recorded payment status and callback delivery independently; never infer bank credit from a button press.'], 'invite-email':['INVITATION EMAIL','Send business invitations from your Gmail.','Connect a personal Google account for invitation sending only, with permission you can revoke.'],diagnostics:['DIAGNOSTICS','Find the failure, follow the fix.','Real API request failures and callback delivery problems, scoped to your account.'],cases:['SUPPORT','Keep questions in one place.','A clear history when a payment needs attention.'],receiving:['RECEIVING ACCOUNTS','Know where payments are going.','Check and manage your receiving accounts.'],developers:['INTEGRATIONS','Connect your business.','API keys, configuration and callback deliveries.'],security:['ACCOUNT','Your account, your control.','Access, permissions and active sessions.'],
connections:['CONNECTION HEALTH','Your payment connections.','See the providers connected to your merchant or platform.'],
policies:['PAYMENT CONTROLS','The rules behind the scenes.','See how your configured payment rules are organized.'],
callbacks:['CALLBACK DELIVERY','Know when your system was notified.','See the outcome of each callback delivery attempt.'],
billing:['FINANCE','A clearer view of billing.','Review invoices and plan information recorded for your account.'],
team:['ACCOUNT ACCESS','Your people, working together.','Review the teammates who can access your workspace.'],
settings:['YOUR BUSINESS','Keep the essentials up to date.','Manage public business details and your callback destination.']};
function el(tag,cls,content){const x=document.createElement(tag);if(cls)x.className=cls;if(content!==undefined)x.textContent=String(content);return x;}
function add(parent,...children){for(const x of children)if(x)parent.appendChild(x);return parent;}
function button(label,fn,cls='small-outline'){const x=el('button',cls,label);x.type='button';x.addEventListener('click',fn);return x;}
function panel(title,subtitle){const p=el('section','panel-card'),h=el('div','card-head'),a=el('div');add(a,el('h2','',title));if(subtitle)add(a,el('p','',subtitle));add(h,a);add(p,h);return p;}
function notice(message,warning=false){return el('p','notice'+(warning?' error':''),message);}
function value(x){return x===undefined||x===null||x===''?'—':String(x);}
function currency(paise){const n=Number(paise)/100;return Number.isFinite(n)?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n):'—';}
function count(n){return new Intl.NumberFormat('en-IN').format(Number(n)||0);}
function date(x){const d=new Date(x);return x&&!Number.isNaN(d.getTime())?d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';}
function status(s){const x=String(s||'UNKNOWN'),v=el('span','status-tag '+x.toLowerCase().replace(/[^a-z0-9_-]/g,''),x.replace(/_/g,' '));return v;}
function metric(label,v,hint=''){const m=el('div','metric');add(m,el('span','metric-label',label),el('strong','metric-value',v),el('span','metric-foot',hint));return m;}
function stats(items){const g=el('div','metric-grid');items.forEach(a=>add(g,metric(...a)));return g;}
function info(items){const l=el('div','info-list');items.forEach(a=>{const c=el('div','info-item');add(c,el('span','',a[0]),el('strong','',value(a[1])));add(l,c);});return l;}
function table(headers,items,fields,open){const wrap=el('div','data-wrap'),t=el('table','data-table'),thead=el('thead'),tr=el('tr');headers.forEach(h=>add(tr,el('th','',h)));add(thead,tr);add(t,thead);const body=el('tbody');items.forEach(item=>{const row=el('tr',open?'row-click':'');fields(item).forEach(v=>{const td=el('td');if(v instanceof Node)add(td,v);else td.textContent=value(v);add(row,td);});if(open){row.tabIndex=0;row.setAttribute('aria-label','Open details');row.addEventListener('click',()=>open(item));row.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();open(item);}});}add(body,row);});if(!items.length){const row=el('tr'),cell=el('td','empty-state','Nothing here yet.');cell.colSpan=headers.length;add(row,cell);add(body,row);}add(t,body);return add(wrap,t);}
function field(label,type,name,attrs={}){const container=el('label',''),control=el(type==='textarea'?'textarea':'input');control.name=name;control.id='field-'+name;if(type!=='textarea')control.type=type;Object.entries(attrs).forEach(([k,v])=>{if(k==='required')control.required=true;else control.setAttribute(k,String(v));});add(container,el('span','',label),control);return {container,control};}
function detail(title,content){$('detail-title').textContent=title;$('detail-body').replaceChildren(content instanceof Node?content:el('pre','',JSON.stringify(content,null,2)));$('detail-layer').hidden=false;document.body.classList.add('dialog-open');$('detail-close').focus();}
function closeDetail(){$('detail-layer').hidden=true;document.body.classList.remove('dialog-open');}
function allowed(p){return !!user&&((user.permissions||[]).includes('*')||(user.permissions||[]).includes(p));}
async function api(path,method='GET',body,extra={}){
  if(!token)throw Error('Please sign in again.');
  path=withMerchantScope(path);
  const headers={Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra};
  const r=await fetch(API+path,{method,credentials:'omit',cache:'no-store',headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>({}));
  if(r.status===401){leave();throw Error('Your session expired. Sign in again.');}
  if(!r.ok)throw Error(data.error||data.message||'Could not complete request ('+r.status+').');
  return data;
}
function stopLive(){if(stream){stream.abort();stream=null;}if(heartbeat){clearInterval(heartbeat);heartbeat=null;}}
function leave(){stopLive();token='';user=null;selectedMerchantId='';merchantDirectory=[];sessionStorage.removeItem(KEY);$('workspace').hidden=true;$('auth-view').hidden=false;}
async function health(){
 let data;try{const r=await fetch('/health',{credentials:'omit',cache:'no-store'});data=await r.json();}
 catch{data={apiOnline:false,financialReady:false,storage:'unknown'};}
 let readiness=null;
 if(user&&data.apiOnline&&allowed('operations.read')){
  try{readiness=await api('/production-readiness'+(user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):''));}catch{}
 }
 const durable=readiness?.storage?.ready??data.financialReady;
 const route=readiness?.merchant?.connectionReady;
 const flag=$('connection-status'),banner=$('financial-banner');
 flag.textContent=!data.apiOnline?'API offline':durable?'API connected':'Storage setup required';
 flag.classList.toggle('degraded',!data.apiOnline||!durable||route===false);
 banner.hidden=Boolean(data.apiOnline&&durable&&route!==false);
 if(!banner.hidden)banner.textContent=!data.apiOnline
   ?'The backend is not responding. Payment creation remains unavailable.'
   :!durable?'Financial writes are blocked: '+(readiness?.storage?.engine||data.storage||'temporary')+' storage is in use. Complete PostgreSQL migration, backup and restore checks first.'
   :'The selected merchant has no configured eligible payment route. Configure and test receiving accounts or an approved provider.';
 return {...data,storageReady:durable,connectionReady:route};
}
async function live(){stopLive();if(!token)return;const controller=new AbortController();stream=controller;heartbeat=setInterval(()=>{if(!document.hidden){void health();void render(current,true);}},45000);
  async function listen(){if(!token||controller.signal.aborted)return;try{const r=await fetch(API+'/stream',{credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+token},signal:controller.signal});if(r.status===401){leave();return;}if(!r.ok||!r.body)throw Error('No stream');const reader=r.body.getReader(),decoder=new TextDecoder();let data='',last=0;while(true){const {done,value:chunk}=await reader.read();if(done)break;data+=decoder.decode(chunk,{stream:true});while(data.includes('\n\n')){const index=data.indexOf('\n\n'),event=data.slice(0,index);data=data.slice(index+2);if(event.includes('session-revoked')){leave();return;}if(event.includes('event: invalidate')&&Date.now()-last>1500){last=Date.now();void render(current,true);}}if(data.length>25000)data='';}}catch(e){if(e.name==='AbortError')return;}if(!controller.signal.aborted&&token)setTimeout(listen,8000);}
  void listen();
}
function intoWorkspace(data){user=data.user;$('auth-view').hidden=true;$('workspace').hidden=false;$('workspace-label').textContent=user.platform?'PLATFORM CONTROL CENTER':'MERCHANT WORKSPACE';$('user-name').textContent=user.email;$('user-role').textContent=user.role;$('user-avatar').textContent=(user.email||'A')[0].toUpperCase();$('header-avatar').textContent=(user.email||'A')[0].toUpperCase();$('page-date').textContent=new Date().toLocaleDateString('en-IN',{dateStyle:'full'});document.querySelectorAll('.nav-item').forEach(x=>{x.hidden=(x.hasAttribute('data-platform-only')&&!user.platform)||(x.dataset.permission&&!allowed(x.dataset.permission));});
 $('merchant-scope-panel').hidden=!user.platform;
 if(user.platform)void loadMerchants().catch(e=>{ $('merchant-scope-note').textContent='Unable to list merchants: '+e.message; });
 select('overview');void health();void live();}
async function signin(email,password){const r=await fetch(API+'/login',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','x-247-auth-mode':'bearer'},body:JSON.stringify({email,password})});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Invalid email or password.');if(!data.sessionToken||!data.user)throw Error('New session could not be created.');token=data.sessionToken;sessionStorage.setItem(KEY,token);intoWorkspace(data);}
async function restore(){if(!token){leave();return;}try{const data=await api('/me');if(!data.user)throw Error('No account');intoWorkspace(data);}catch{leave();}}
async function signout(){try{if(token)await api('/logout','POST',{});}catch{}leave();}
function select(name){const b=document.querySelector('.nav-item[data-view="'+name+'"]');if(!b||b.hidden)return;current=name;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('is-active',x===b));$('sidebar').classList.remove('open');$('sidebar-toggle').setAttribute('aria-expanded','false');void render(name);}
async function render(name,quiet=false){if(!user)return;const version=++renderVersion;const data=titles[name]||titles.overview;$('page-eyebrow').textContent=data[0];$('page-title').textContent=data[1];$('page-intro').textContent=data[2];$('current-view-name').textContent=name[0].toUpperCase()+name.slice(1);const content=$('view-content');if(!quiet)content.replaceChildren(el('div','loading-panel','Loading your account…'));
try{let parts;if(name==='overview')parts=await overview();else if(name==='payments')parts=await payments();else if(name==='merchants')parts=await merchants();else if(name==='operations')parts=await operations();else if(name==='verification')parts=await verification();else if(name==='invite-email')parts=await invitationEmail();else if(name==='diagnostics')parts=await diagnostics();else if(name==='cases')parts=await cases();else if(name==='receiving')parts=await receiving();else if(name==='developers')parts=await developers();else if(name==='connections')parts=await connections();else if(name==='policies')parts=await policies();else if(name==='callbacks')parts=await callbacks();else if(name==='billing')parts=await billing();else if(name==='team')parts=await team();else if(name==='settings')parts=await settings();else parts=await security();if(version===renderVersion&&name===current)content.replaceChildren(...parts);}catch(e){if(version===renderVersion&&name===current){const p=panel('This section needs attention','The other workspace sections remain available.');add(p,el('p','notice error',e.message),button('Try again',()=>render(name)));content.replaceChildren(p);}}}
async function overview(){
 const result=[];
 const scoped=user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):'';
 if(allowed('transactions.read')){
  const k=await api('/dashboard/kpis'+scoped),s=k.summary||{};
  result.push(stats([
   ['Payment orders',count(s.transactions),'Recorded orders and payment sessions'],
   ['Confirmed volume',currency(s.confirmedPaise||'0'),'Verified gross INR excluding COD'],
   ['Confirmed',count(s.confirmed),'Provider / source-confirmed outcomes'],
   ['Pending',count(s.pending),'Awaiting reliable confirmation'],
   ['Failed',count(s.failed),'Failed, expired or cancelled'],
   ['Confirmation rate',String(s.confirmationRate||0)+'%','Share of all recorded payment orders']
  ]));
  if(user.platform){
   const header=panel('Platform performance',selectedMerchantId?'Merchant-filtered totals from the authoritative database.':'All registered merchants, platform-wide financial records.');
   add(header,info([['Merchants registered',count(k.merchantCount)],['View',selectedMerchantId?'Selected merchant':'All merchants'],['Volume reporting','Gross confirmed value, not net revenue or settlement']]),notice(k.note));
   result.unshift(header);
   const breakdown=panel('Merchant performance','Select a row to inspect its payments and technical health.');
   add(breakdown,table(['Merchant','Orders','Confirmed value','Failed','Pending'],k.merchantBreakdown||[],
    x=>[x.businessName||x.merchantId,count(x.transactions),currency(x.confirmedPaise),count(x.failed),count(x.pending)],
    x=>{selectedMerchantId=x.merchantId;$('merchant-scope').value=x.merchantId;$('merchant-scope-note').textContent='Merchant selected for detailed review.';void render('overview');}));
   result.push(breakdown);
  }
  const recent=await api('/transactions?limit=8'+(scoped?'&merchantId='+encodeURIComponent(selectedMerchantId):'')),
   c=panel('Latest payments','Real transaction records with the current backend status.');
  add(c,table(user.platform?['Order','Merchant ID','Amount','Status','Created']:['Order','Amount','Status','Created'],
    recent.items||[],
    x=>user.platform?[el('span','mono',x.order_id||x.id),x.merchant_id,currency(x.amount_paise),status(x.status),date(x.created_at)]
      :[el('span','mono',x.order_id||x.id),currency(x.amount_paise),status(x.status),date(x.created_at)],
    x=>transaction(x.id)));
  result.push(c);
 }
 if(allowed('operations.read')){
  const r=await api('/production-readiness'+scoped);
  const readiness=panel('Production readiness','The status is computed by the backend; it is not a payment success assertion.');
  add(readiness,info([
   ['Financial database',r.storage?.ready?'Ready · PostgreSQL':'Financial writes blocked · '+(r.storage?.engine||'unknown')],
   ['Merchant',r.merchant?.id||'All-merchant overview'],
   ['Receiving / provider route',r.merchant?.connectionReady===null?'Select a merchant':r.merchant?.connectionReady?'Configured · needs real validation':'Not configured'],
   ['Readiness',r.status]
  ]),notice(r.note));
  result.push(readiness);
 }
 if(!user.platform){const c=panel('Business account','Your own business and account permissions.');add(c,info([['Merchant ID',user.merchantId],['Account',user.email],['Role',user.role]]));result.push(c);}
 if(!result.length){const c=panel('Welcome','Your account is ready.');add(c,notice('Choose a section to review the tools available to this role.'));result.push(c);}
 return result;
}
async function payments(){const d=await api('/transactions?limit=50'),rows=d.items||[],c=panel('Payment history','Select a payment to see its recorded events and delivery history.');const search=el('input');search.type='search';search.placeholder='Search payments';search.setAttribute('aria-label','Search payments');const area=el('div');const paint=()=>area.replaceChildren(table(['Order','Amount','Method','Status','Created'],rows.filter(x=>(String(x.order_id||x.id)+' '+x.status+' '+x.method).toLowerCase().includes(search.value.toLowerCase())),x=>[el('span','mono',x.order_id||x.id),currency(x.amount_paise),x.method,status(x.status),date(x.created_at)],x=>transaction(x.id)));search.addEventListener('input',paint);paint();add(c,add(el('div','toolbar'),search),area);
const result=[c];if(!user.platform&&allowed('payments.create')){const p=panel('Create a payment request','This uses your real payment configuration, not a demo.');const form=el('form','form-grid'),order=field('Order reference','text','orderId',{required:true,pattern:'[-A-Za-z0-9_]{1,120}',maxlength:120}),amount=field('Amount in rupees','number','amount',{required:true,min:0.01,step:0.01});order.control.value='ORDER-'+Date.now();const submit=el('button','primary-button','Create payment');submit.type='submit';const actions=add(el('div','form-actions'),submit);add(form,order.container,amount.container,actions);form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{const r=await api('/payments','POST',{orderId:order.control.value,amount:amount.control.value,currency:'INR'},{'Idempotency-Key':crypto.randomUUID()});const body=info([['Order',r.orderId],['Amount',r.amount],['Status',r.status]]);if(r.checkoutUrl){const u=new URL(r.checkoutUrl,location.origin);if(u.origin===location.origin)add(body,add(el('p'),(()=>{const a=el('a','card-link','Open customer checkout');a.href=u.pathname;return a;})()));}detail('Payment request',body);void render('payments');}catch(err){detail('Payment not created',notice(err.message,true));}finally{submit.disabled=false;}});add(p,form);result.unshift(p);}return result;}
async function transaction(id){try{const r=await api('/transactions/'+encodeURIComponent(id)),x=r.transaction||{},box=el('div');add(box,info([['Order',x.order_id],['Payment ID',x.id],['Amount',currency(x.amount_paise)],['Method',x.method],['Status',x.status],['Created',date(x.created_at)]]));const c=panel('Order timeline','Recorded events and delivery updates');add(c,table(['Event','When'],r.timeline||[],e=>[e.event_type||e.action||e.outcome,date(e.created_at)]));add(box,c);detail('Payment details',box);}catch(err){detail('Payment details',notice(err.message,true));}}
async function merchants(){const r=await api('/merchants?limit=50'),c=panel('Merchant directory','Visible only to authorized platform operators.');add(c,table(['Business','Status','Merchant ID','Created'],r.merchants||[],x=>[x.profile?.businessName||x.merchant_id,status(x.status),el('span','mono',x.merchant_id),date(x.created_at)],async x=>{try{detail('Merchant details',await api('/merchants/'+encodeURIComponent(x.merchant_id)));}catch(e){detail('Merchant',notice(e.message,true));}}));add(c,notice('Showing '+count((r.merchants||[]).length)+' of '+count(r.total)+' merchants.'));
 const result=[c];
 if(user.role==='SUPER_ADMIN'){
  const create=panel('Add a merchant','Invite a business owner to create their own password.');
  const form=el('form','form-grid'),business=field('Business name','text','merchantBusiness',{required:true,maxlength:150}),
   contact=field('Contact name','text','merchantContact',{required:true,maxlength:150}),
   email=field('Owner email','email','merchantEmail',{required:true,maxlength:254}),
   mobile=field('Mobile number','tel','merchantMobile',{required:true,pattern:'[+]?[0-9]{10,15}'});
  const submit=el('button','primary-button','Create merchant and invite owner');submit.type='submit';
  add(form,business.container,contact.container,email.container,mobile.container,add(el('div','form-actions'),submit));
  form.addEventListener('submit',async e=>{
   e.preventDefault();submit.disabled=true;
   try{
    const data=await api('/merchants','POST',{businessName:business.control.value,contactName:contact.control.value,email:email.control.value,mobile:mobile.control.value});
    const summary=info([['Business',data.businessName],['Merchant ID',data.merchantId],['Owner email',data.ownerEmail],['Invitation sent',data.invitationSent?'Yes':'Pending delivery']]);
    if(typeof data.invitationPath==='string'&&data.invitationPath.startsWith('/platform#owner-invitation/')){
     const invitation=el('a','card-link','Open merchant-owner activation link');
     invitation.href=data.invitationPath;
     invitation.target='_blank';invitation.rel='noopener noreferrer';
     const copy=button('Copy private invitation URL',async()=>{
       try{await navigator.clipboard.writeText(location.origin+data.invitationPath);copy.textContent='Copied to clipboard';}
       catch{detail('Copy failed',notice('Use the activation link displayed above; do not share it publicly.',true));}
     });
     add(summary,notice('Email delivery is not configured. Share this private one-time invitation only with the merchant owner.'),invitation,copy);
    }
    detail('Merchant created',summary);
    await loadMerchants();void render('merchants');
   }catch(err){detail('Merchant not created',notice(err.message,true));}finally{submit.disabled=false;}
  });
  add(create,form);result.unshift(create);
 }
 return result;}
async function verification(){
 const scope=user.platform&&selectedMerchantId?'&merchantId='+encodeURIComponent(selectedMerchantId):'';
 const [tx,kpi,healthData]=await Promise.all([
  api('/transactions?limit=30'+scope),
  api('/dashboard/kpis'+(scope?'?merchantId='+encodeURIComponent(selectedMerchantId):'')),
  api('/operations/health'+(scope?'?merchantId='+encodeURIComponent(selectedMerchantId):''))
 ]);
 const c=panel('Money-flow verification','These numbers come from the stored backend financial states. They are not a bank statement or cash balance.');
 const s=kpi.summary||{},d=healthData.callbacks||{};
 add(c,stats([['Confirmed UPI / online volume',currency(s.confirmedPaise||0),'Gross confirmed payment value excluding COD'],
 ['Awaiting confirmation',count(s.pending),'Do not release goods for pending orders'],
 ['Successful callback deliveries',count(d.successful),'The merchant endpoint acknowledged delivery'],
 ['Pending / failed deliveries',count((d.pending||0)+(d.failed||0)),'Delivery issues need investigation']]));
 const explain=panel('What counts as proof?','A callback delivery result and a payment confirmation are different records.');
 add(explain,notice('A SUCCESS status is what the payment engine has recorded after its source verification. Delivery of a webhook only confirms that the destination HTTP endpoint acknowledged a message. Review a payment timeline and reconcile the provider / bank statement before treating it as settled funds.'));
 const rows=panel('Check an individual payment','Use Check to open the latest stored payment events, observation source and callback attempts.');
 add(rows,table(['Merchant','Payment / order','Amount','Status','Source','Check'],tx.items||[],x=>[
  x.merchant_id||user.merchantId,el('span','mono',x.order_id||x.id),currency(x.amount_paise),
  status(x.status),x.source_type||x.method||'—',button('Check now',()=>transaction(x.id))
 ]));
 add(rows,button('Refresh verified states',()=>render('verification'),'small-outline'));
 const route=panel('Provider and callback monitoring','See connection heartbeat and delivery results in their dedicated sections.');
 add(route,button('Provider health',()=>select('operations')),button('Inspect callbacks',()=>select('callbacks')),button('API failures',()=>select('diagnostics')));
 return[c,explain,rows,route];
}
async function operations(){const r=await api('/operations/health'+(user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):'')),c=r.callbacks||{};const metrics=stats([['Delivered callbacks',count(c.successful),'Delivery records'],['Pending callbacks',count(c.pending),'Awaiting delivery'],['Failed callbacks',count(c.failed),'Need attention'],['Providers',count(r.providers?.length),'Configured records']]);const providers=panel('Provider connections','Live backend configuration status');add(providers,table(['Name','Status','Last check'],r.providers||[],p=>[p.provider_name,status(p.status),date(p.last_tested_at)]));const observers=panel('Additional observations','Notifications are supplementary, not proof of bank credit');add(observers,table(['Device','Active','Last heartbeat'],r.observers||[],o=>[o.device_name||o.id,status(o.is_active?'ACTIVE':'INACTIVE'),date(o.last_heartbeat_at)]));return[metrics,providers,observers];}
async function diagnostics(){
 const scoped=user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):'';
 const [data,healthData]=await Promise.all([api('/dashboard/api-failures'+scoped),api('/operations/health'+scoped)]);
 const apiStats=data.api||{},out=[
  stats([
   ['API requests',count(apiStats.recorded),'Instrumented merchant API-key calls'],
   ['API failures',count(apiStats.failures),'Recorded HTTP 4xx/5xx responses'],
   ['Server errors',count(apiStats.serverErrors),'Recorded HTTP 5xx responses'],
   ['Failed callbacks',count(data.callbacks?.filter(x=>x.state==='NEEDS_ATTENTION').length),'Recent unresolved deliveries'],
   ['Queued callbacks',count(data.callbacks?.filter(x=>x.state==='PENDING_RETRY').length),'Recent scheduled redeliveries'],
   ['Connections',count(healthData.providers?.length),'Provider records in scope']
  ])
 ];
 const apiCard=panel('Recent API failures','Only instrumented merchant API-key traffic is captured. Other server errors require application logs.');
 add(apiCard,table(['Merchant','Method','API path','HTTP','Latency','When'],apiStats.items||[],
  r=>[r.merchant_id||'Unknown',r.method,el('span','mono',r.path),status(r.status),String(r.duration_ms)+' ms',date(r.created_at)],
  r=>detail('API request diagnostic',info([['Merchant ID',r.merchant_id||'Unknown'],['Method',r.method],['Path',r.path],['HTTP status',r.status],['Latency',String(r.duration_ms)+' ms'],['Created',date(r.created_at)]]))));
 out.push(apiCard);
 const callbacks=panel('Callback delivery queue','Inspect failed deliveries and request retry. Retrying does not mark a payment paid.');
 const onRetry=async r=>{
  if(!allowed('webhooks.manage'))return;
  if(user.platform&&!selectedMerchantId){
   const merchant=merchantDirectory.find(m=>m.merchant_id===r.merchantId);
   if(merchant){selectedMerchantId=r.merchantId;$('merchant-scope').value=r.merchantId;void render('diagnostics');}
   else detail('Select merchant first',notice('Choose merchant '+r.merchantId+' in the account selector before retrying.'));
   return;
  }
  if(user.platform&&selectedMerchantId!==r.merchantId){
   detail('Different merchant selected',notice('Select the correct merchant before retrying this callback.'));return;
  }
  if(!confirm('Queue another delivery attempt for this existing callback? This does not confirm a payment.'))return;
  try{
   await api('/webhook-deliveries/'+encodeURIComponent(r.id)+'/retry','POST',{source:r.source});
   detail('Callback queued',notice('A delivery retry was requested. Check the next status update for the outcome.'));
   void render('diagnostics');
  }catch(e){detail('Retry not accepted',notice(e.message,true));}
 };
 add(callbacks,table(['Merchant','Event','State','Attempts','HTTP','Next retry','Action'],data.callbacks||[],
  r=>[r.merchantId,r.eventType,status(r.state),count(r.attempts),r.responseStatus||'—',date(r.nextRetryAt),
      allowed('webhooks.manage')?button(user.platform&&!selectedMerchantId?'Select merchant':'Retry',()=>onRetry(r)): 'View only']));
 add(callbacks,notice(data.note));
 out.push(callbacks);
 return out;
}
async function cases(){
 const scoped=user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):'';
 const data=await api('/cases?limit=50'+(scoped?'&merchantId='+encodeURIComponent(selectedMerchantId):'')),
  c=panel('Support cases','Case history, evidence and status are saved by the backend.');
 const transitions={OPEN:['INVESTIGATING','WAITING','RESOLVED'],INVESTIGATING:['WAITING','RESOLVED'],WAITING:['INVESTIGATING','RESOLVED'],RESOLVED:['INVESTIGATING','CLOSED'],CLOSED:[]};
 async function openCase(item){
  try{
   const r=await api('/cases/'+encodeURIComponent(item.id)),record=r.case||{},wrapper=el('div');
   add(wrapper,info([['Subject',record.title],['Merchant ID',record.merchant_id],['Type',record.kind],
     ['Status',record.status],['Payment ID',record.payment_id||'Not linked'],['Description',record.description]]));
   const timeline=panel('Case timeline','All changes are recorded as audit events.');
   add(timeline,table(['Status','Note','When'],r.timeline||[],x=>[status(x.status),x.note,date(x.created_at)]));
   add(wrapper,timeline);
   if(allowed('operations.write')&&(transitions[record.status]||[]).length){
    const form=el('form','form-grid'),next=el('select'),reason=field('Investigation note','textarea','caseNote',{required:true,minlength:2,maxlength:4000});
    for(const state of transitions[record.status]||[])next.add(new Option(state.replace(/_/g,' '),state));
    const label=el('label');add(label,el('span','','Next status'),next);
    const submit=el('button','primary-button','Record case update');submit.type='submit';
    add(form,label,reason.container,add(el('div','form-actions'),submit));add(wrapper,form);
    form.addEventListener('submit',async e=>{
     e.preventDefault();submit.disabled=true;
     try{
      await api('/cases/'+encodeURIComponent(item.id)+'/events','POST',{status:next.value,note:reason.control.value});
      detail('Case updated',notice('The new state and note are recorded in the case timeline.'));
      void render('cases');
     }catch(err){detail('Update not saved',notice(err.message,true));}finally{submit.disabled=false;}
    });
   }
   detail('Case details',wrapper);
  }catch(e){detail('Unable to load case',notice(e.message,true));}
 }
 add(c,table(['Subject','Merchant','Category','Status','Updated'],data.items||[],
  x=>[x.title,x.merchant_id||'Platform',x.kind,status(x.status),date(x.updated_at)],openCase));
 const result=[c];
 if(allowed('operations.write')&&(!user.platform||selectedMerchantId)){
  const formCard=panel('Open a support case','Document a payment, dispute, reconciliation or operational problem.');
  const form=el('form','form-grid'),kind=el('select'),kindLabel=el('label'),
   title=field('Subject','text','caseTitle',{required:true,maxlength:200}),
   desc=field('What happened?','textarea','caseDescription',{required:true});
  for(const v of ['SUPPORT','DISPUTE','RECONCILIATION'])kind.add(new Option(v,v));
  add(kindLabel,el('span','','Case category'),kind);
  const submit=el('button','primary-button','Open case');submit.type='submit';
  add(form,kindLabel,title.container,desc.container,add(el('div','form-actions'),submit));
  form.addEventListener('submit',async e=>{
   e.preventDefault();submit.disabled=true;
   try{
    await api('/cases','POST',{kind:kind.value,merchantId:user.platform?selectedMerchantId:user.merchantId,
      title:title.control.value,description:desc.control.value});
    detail('Case created',notice('Your case is open and has been added to the history.'));void render('cases');
   }catch(err){detail('Case not created',notice(err.message,true));}finally{submit.disabled=false;}
  });
  add(formCard,form);result.unshift(formCard);
 }
 return result;
}
function merchantSelectionCard(){
 const p=panel('Select a business first','Choose a merchant in the account selector above to inspect its tools without signing in as that merchant.');
 const choose=button('Open merchant directory',()=>select('merchants'),'small-outline');
 const hint=notice('Platform-wide performance is available from Overview. Merchant API keys, callbacks, receiving accounts and business settings require a selected business.');
 add(p,hint,choose);
 return p;
}
async function receiving(){if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];const d=await api('/receiving-accounts'),c=panel('Receiving accounts','Only accounts belonging to this business are shown.');add(c,table(['Payee','UPI ID','Status','Change'],d.accounts||[],a=>[a.payeeName||a.payee_name,el('span','mono',a.upiId||a.upi_id),status(a.isActive||a.is_active?'ACTIVE':'INACTIVE'),button(a.isActive||a.is_active?'Disable':'Enable',async()=>{if(!confirm('Update this receiving account?'))return;try{await api('/receiving-accounts/'+encodeURIComponent(a.id)+'/state','POST',{active:!(a.isActive||a.is_active)});void render('receiving');}catch(err){detail('Account update failed',notice(err.message,true));}})]));const p=panel('Add a receiving account','New accounts start inactive until you choose to enable them.'),form=el('form','form-grid'),vpa=field('UPI ID','text','upiId',{required:true,maxlength:120,placeholder:'merchant@bank'}),name=field('Payee name','text','payeeName',{required:true,maxlength:150}),submit=el('button','primary-button','Add account');submit.type='submit';add(form,vpa.container,name.container,add(el('div','form-actions'),submit));form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{await api('/receiving-accounts','POST',{upiId:vpa.control.value,payeeName:name.control.value});void render('receiving');}catch(err){detail('Account not added',notice(err.message,true));}finally{submit.disabled=false;}});add(p,form);return[c,p];}
async function developers(){
 if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];
 const [keysResult,readinessResult,usageResult]=await Promise.allSettled([
  api('/api-keys'),api('/integration-readiness'),api('/api-usage')
 ]);
 const result=[],readiness=panel('Integration readiness','Status reported by the backend for the currently selected business.');
 if(readinessResult.status==='fulfilled'){
  const r=readinessResult.value;
  add(readiness,info([['Configuration ready',r.configurationReady?'Yes':'Not yet'],['Reason',r.message||r.reason||'Review the required settings']]));
 }else add(readiness,notice(readinessResult.reason.message,true));
 result.push(readiness);
 const keys=panel('Merchant API credentials','Existing secret values are never retrievable. You can revoke or rotate credentials securely.');
 if(keysResult.status==='fulfilled'){
  const data=keysResult.value;
  add(keys,table(['Name','Environment','Scopes','Last used','Status','Action'],data.keys||[],k=>[
    k.label,k.environment,(k.scopes||[]).join(', '),date(k.lastUsedAt),
    status(k.revokedAt?'REVOKED':'ACTIVE'),
    k.revokedAt?'Revoked':button('Revoke',async()=>{
      if(!confirm('Revoke API access for this credential immediately?'))return;
      try{await api('/api-keys/'+encodeURIComponent(k.id)+'/revoke','POST',{});
       detail('API key revoked',notice('The key is no longer accepted for future requests.'));void render('developers');
      }catch(e){detail('Unable to revoke key',notice(e.message,true));}
    })
  ]));
  const form=el('form','form-grid'),
   label=field('Credential label','text','keyLabel',{required:true,maxlength:80}),
   env=el('select'),envLabel=el('label'),scopesWrap=el('div','scope-options');
  add(envLabel,el('span','','Environment'),env);env.name='environment';
  for(const v of ['SANDBOX','PRODUCTION'])env.add(new Option(v==='SANDBOX'?'Sandbox':'Production',v));
  const scopeTitle=el('label','','Allowed API scopes');
  add(scopesWrap,scopeTitle);
  for(const name of data.supportedScopes||[]){
   const labelNode=el('label','scope-option'),input=el('input');
   input.type='checkbox';input.name='apiScope';input.value=name;
   if(name==='payments.read'||name==='transactions.read')input.checked=true;
   add(labelNode,input,el('span','',name));add(scopesWrap,labelNode);
  }
  const submit=el('button','primary-button','Issue new API key');submit.type='submit';
  const hints=notice('Secrets are displayed only once after creation. Store them in a private secrets manager, never in frontend JavaScript.');
  add(form,label.container,envLabel,scopesWrap,hints,add(el('div','form-actions'),submit));
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   const scopes=Array.from(form.querySelectorAll('input[name="apiScope"]:checked')).map(x=>x.value);
   if(!scopes.length){detail('Choose API permissions',notice('Select at least one API scope.',true));return;}
   if(!confirm('Issue a new '+env.value+' API key with the selected permissions?'))return;
   submit.disabled=true;
   try{
    const r=await api('/api-keys','POST',{label:label.control.value,environment:env.value,scopes});
    const secret=el('code','mono',r.secret),summary=el('div');
    add(summary,notice('This secret is shown once. Copy it and keep it private.'),
      info([['Name',r.key?.label],['Environment',r.key?.environment],['Scopes',(r.key?.scopes||[]).join(', ')]]),secret,
      button('Copy secret',async()=>{try{await navigator.clipboard.writeText(r.secret);}catch{}}));
    detail('New API key created',summary);void render('developers');
   }catch(e){detail('Unable to issue key',notice(e.message,true));}
   finally{submit.disabled=false;}
  });
  add(keys,form);
 }else add(keys,notice(keysResult.reason.message,true));
 result.push(keys);
 const usage=panel('API request history','This lists instrumented merchant API-key calls, not every public website request.');
 if(usageResult.status==='fulfilled'){
  add(usage,table(['Method','Path','HTTP status','Duration','When'],usageResult.value.requests||[],
   r=>[r.method,el('span','mono',r.path),status(r.status),String(r.duration_ms)+' ms',date(r.created_at)]));
 }else add(usage,notice(usageResult.reason.message,true));
 result.push(usage);
 return result;
}
async function connections(){
 const scoped=user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):'';
 const data=await api('/connections'+scoped),card=panel('Payment connections','Approved provider routes, their health and last diagnostic results.');
 const parsedTest=row=>{
  try{return typeof row.testResult==='string'?JSON.parse(row.testResult):row.testResult||{};}
  catch{return {};}
 };
 const showPolicy=(row,action,payload)=>{
  const wrapper=el('div'),form=el('form','form-grid'),
   reason=field('Why are you changing this route?','textarea','routeReason',{required:true,minlength:5,maxlength:500}),
   submit=el('button','primary-button','Confirm '+action);submit.type='submit';
  add(wrapper,info([['Provider',row.provider],['Merchant',row.merchantId],['Environment',row.environment],
    ['Authenticated by test',parsedTest(row).authenticated?'Yes':'Not confirmed']]));
  add(form,reason.container,notice('Route changes are written to the backend audit log. This does not confirm that money was received.'),add(el('div','form-actions'),submit));add(wrapper,form);
  form.addEventListener('submit',async e=>{
   e.preventDefault();submit.disabled=true;
   try{
    const updated=await api('/connections/'+encodeURIComponent(row.id)+'/state','POST',{...payload,reason:reason.control.value});
    detail('Connection updated',info([['Provider',updated.connection?.provider],['Status',updated.connection?.status],['Enabled',updated.connection?.enabled?'Yes':'No']]));
    void render('connections');
   }catch(err){detail('Connection update failed',notice(err.message,true));}
   finally{submit.disabled=false;}
  });
  detail(action+' connection',wrapper);
 };
 add(card,table(['Merchant','Provider','Environment','Status','Approved','Enabled','Actions'],data.connections||[],r=>{
  const actions=el('div','toolbar'),test=parsedTest(r);
  add(actions,button('Test',async()=>{
    try{
     const check=await api('/connections/'+encodeURIComponent(r.id)+'/test','POST',{});
     detail('Provider connection test',info([
      ['Provider',r.provider],['Environment',r.environment],
      ['Reachable',check.reachable?'Yes':'No'],['Authenticated',check.authenticated?'Yes':'No'],
      ['HTTP status',check.httpStatus],['Latency',String(check.latencyMs)+' ms']
     ]));
     void render('connections');
    }catch(err){detail('Connection test failed',notice(err.message,true));}
  }));
  if(r.enabled)add(actions,button('Disable',()=>showPolicy(r,'Disable',{enabled:false})));
  else if(r.approved&&test.authenticated)add(actions,button('Enable',()=>showPolicy(r,'Enable',{enabled:true})));
  if(user.platform&&!r.approved&&test.authenticated)add(actions,button('Approve',()=>showPolicy(r,'Approve',{enabled:false,approved:true})));
  return [r.merchantId||user.merchantId,r.provider,r.environment,status(r.status),r.approved?'Yes':'No',r.enabled?'Yes':'No',actions];
 }));
 add(card,notice('Testing a connection checks provider authentication. It does not verify a bank credit or authorize automatic settlement.'));
 const result=[card];
 if(!user.platform||selectedMerchantId){
  const newCard=panel('Add provider connection','Only a supported provider with valid credentials can be submitted for review.');
  const form=el('form','form-grid'),
   client=field('Provider client ID','text','connectionClient',{required:true,maxlength:300}),
   secret=field('Provider client secret','password','connectionSecret',{required:true,maxlength:500}),
   environment=el('select'),label=el('label'),submit=el('button','primary-button','Submit connection for review');
  environment.add(new Option('Sandbox','SANDBOX'));environment.add(new Option('Production','PRODUCTION'));
  add(label,el('span','','Environment'),environment);submit.type='submit';
  add(form,el('p','card-note','Provider: Cashfree (the current backend supported adapter)'),label,client.container,secret.container,
      notice('Provider credentials stay on the backend and are encrypted. New connections start disabled and unapproved.'),
      add(el('div','form-actions'),submit));
  form.addEventListener('submit',async e=>{
   e.preventDefault();submit.disabled=true;
   try{
    const b={provider:'CASHFREE',environment:environment.value,clientId:client.control.value,clientSecret:secret.control.value};
    if(user.platform)b.merchantId=selectedMerchantId;
    await api('/connections','POST',b);
    secret.control.value='';
    detail('Connection submitted',notice('The connection is awaiting diagnostic testing and approval.'));
    void render('connections');
   }catch(err){detail('Connection not created',notice(err.message,true));}finally{submit.disabled=false;}
  });add(newCard,form);result.push(newCard);
 }
 return result;
}
async function policies(){
 const data=await api('/rules'),all=data.rules||[],visible=user.platform&&selectedMerchantId
  ?all.filter(x=>x.global||x.merchantId===selectedMerchantId):all;
 const c=panel('Payment policies','All policy changes are saved and audited by the backend.');
 const change=(rule,active)=>{
  const wrapper=el('div'),form=el('form','form-grid'),
   reason=field('Reason for this change','textarea','ruleReason',{required:true,minlength:5,maxlength:1000}),
   submit=el('button','primary-button',active?'Activate rule':'Deactivate rule');
  submit.type='submit';
  add(wrapper,info([['Rule',rule.ruleType],['Target',rule.target],['Scope',rule.global?'Platform-wide':rule.merchantId]]));
  add(form,reason.container,notice('Changing this rule can affect future payment requests; it does not modify past payment results.'),add(el('div','form-actions'),submit));
  form.addEventListener('submit',async e=>{
   e.preventDefault();submit.disabled=true;
   try{
    await api('/rules/'+encodeURIComponent(rule.id)+'/state','POST',{active,reason:reason.control.value});
    detail('Policy updated',notice('The new policy state has been saved with an audit revision.'));
    void render('policies');
   }catch(e){detail('Policy change failed',notice(e.message,true));}finally{submit.disabled=false;}
  });add(wrapper,form);detail(active?'Activate payment rule':'Deactivate payment rule',wrapper);
 };
 add(c,table(['Rule','Target type','Target','Scope','Status','Actions'],visible,r=>{
  const actions=el('div','toolbar');
  add(actions,button('History',async()=>{
   try{const x=await api('/rules/'+encodeURIComponent(r.id)+'/history');
    detail('Policy history',table(['Saved revision','Date'],x.revisions||[],i=>[i.id,date(i.created_at)]));
   }catch(err){detail('History unavailable',notice(err.message,true));}
  }));
  add(actions,button(r.active?'Disable':'Activate',()=>change(r,!r.active)));
  return [r.ruleType,r.targetType,r.target,r.global?'Platform':r.merchantId,status(r.active?'ACTIVE':'INACTIVE'),actions];
 }));
 const formCard=panel('Create a policy','Rules are enforced by the backend. New rules are active when saved.');
 const form=el('form','form-grid'),ruleType=el('select'),targetType=el('select'),
  typeLabel=el('label'),targetLabel=el('label'),target=field('Match value','text','ruleTarget',{required:true,maxlength:150}),
  reason=field('Why is this rule needed?','textarea','newRuleReason',{required:true,minlength:5,maxlength:1000}),
  submit=el('button','primary-button','Create payment rule');submit.type='submit';
 for(const v of ['WATCH','BLOCK','ALLOW'])ruleType.add(new Option(v,v));
 for(const v of ['MERCHANT','RECEIVING_VPA','CUSTOMER_VPA','CUSTOMER','PROVIDER'])targetType.add(new Option(v.replace(/_/g,' '),v));
 add(typeLabel,el('span','','Decision'),ruleType);add(targetLabel,el('span','','Target type'),targetType);
 const noticeText=user.platform&&!selectedMerchantId?'This will be a PLATFORM-WIDE rule. Select a merchant at the top first to create a merchant-only rule.'
  :user.platform?'This rule will apply only to the selected merchant.':'This rule will apply to your business only.';
 add(form,typeLabel,targetLabel,target.container,reason.container,notice(noticeText),add(el('div','form-actions'),submit));
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const global=user.platform&&!selectedMerchantId;
  if(!confirm(global?'Create a platform-wide rule that may affect every merchant?':'Create a new rule for this merchant?'))return;
  submit.disabled=true;
  try{
   const body={ruleType:ruleType.value,targetType:targetType.value,target:target.control.value,reason:reason.control.value,global};
   if(user.platform&&!global)body.merchantId=selectedMerchantId;
   await api('/rules','POST',body);
   detail('Rule created',notice('Your new policy was saved. Its effects apply to future requests only.'));
   void render('policies');
  }catch(err){detail('Rule not created',notice(err.message,true));}finally{submit.disabled=false;}
 });
 add(formCard,form);
 return[c,formCard];
}
async function callbacks(){
 if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];
 const result=await api('/webhook-deliveries');
 const entries=result.deliveries||[],c=panel('Callback deliveries','Real delivery attempts, including both payment and provider events.');
 const renderAction=row=>{
  const delivered=Boolean(row.is_successful),area=el('div','toolbar');
  if(delivered)return status('DELIVERED');
  add(area,status(row.next_retry_at?'QUEUED':'NEEDS_ATTENTION'));
  if(allowed('webhooks.manage'))add(area,button('Retry callback',async()=>{
   if(!confirm('Retry delivering this existing event? This does NOT confirm receipt of money.'))return;
   try{
    await api('/webhook-deliveries/'+encodeURIComponent(row.id)+'/retry','POST',{source:row.source});
    detail('Delivery retry queued',notice('The payment record was not changed. Only callback redelivery was requested.'));
    void render('callbacks');
   }catch(err){detail('Retry unavailable',notice(err.message,true));}
  }));
  return area;
 };
 add(c,stats([
  ['Delivered',count(entries.filter(x=>x.is_successful).length),'HTTP-acknowledged events'],
  ['Retry pending',count(entries.filter(x=>!x.is_successful&&x.next_retry_at).length),'Delivery queue'],
  ['Needs attention',count(entries.filter(x=>!x.is_successful&&!x.next_retry_at).length),'Inspect and retry carefully']
 ]));
 add(c,table(['Event','Source','Attempts','HTTP','Next retry','Status / action'],entries,
  x=>[x.event_type,x.source||'—',count(x.attempt_count),x.response_status||'—',date(x.next_retry_at),renderAction(x)]));
 add(c,notice('Callbacks do not prove bank settlement. Merchants should validate webhook HMAC signatures and deduplicate event IDs.'));
 return[c];
}
async function billing(){
 const selected=user.platform&&selectedMerchantId?'&merchantId='+encodeURIComponent(selectedMerchantId):'';const [invoices,subscriptions]=await Promise.allSettled([api('/billing/invoices?limit=30'+selected),api('/billing/subscriptions?limit=30'+selected)]);
 const a=panel('Your invoices','Billing records saved for this account.');
 if(invoices.status==='fulfilled')add(a,table(['Invoice','Status','Period','Amount'],invoices.value.items||[],r=>[r.period||r.id,status(r.status),r.period_start||r.period_end,currency(r.total_paise||r.amount_paise||0)]));
 else add(a,notice(invoices.reason.message,true));
 const b=panel('Subscriptions','Assigned plans and effective periods.');
 if(subscriptions.status==='fulfilled')add(b,table(['Plan','Merchant','Effective'],subscriptions.value.items||[],r=>[r.plan_id,r.merchant_id,r.effective_from]));
 else add(b,notice(subscriptions.reason.message,true));
 return[a,b];
}
async function team(){
 const data=await api('/staff'),p=panel('Team access','Only roles you are authorized to manage are shown.');
 add(p,table(['Member','Role','Status'],data.users||[],u=>[u.email,u.role,status(u.active?'ACTIVE':'INACTIVE')]));
 return[p];
}
async function settings(){if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];
 const data=await api('/settings'),p=panel('Business settings','These settings appear in your account and may be used by your payment integrations.');
 const form=el('form','form-grid'),name=field('Business name','text','businessName',{required:true,minlength:2,maxlength:150}),url=field('Callback URL','url','webhookUrl',{placeholder:'https://your-business.example/payments/webhook'});
 name.control.value=data.businessName||'';url.control.value=data.webhookUrl||'';
 const save=el('button','primary-button','Save business settings');save.type='submit';
 add(form,name.container,url.container,add(el('div','form-actions'),save));
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{const updated=await api('/settings','POST',{businessName:name.control.value,webhookUrl:url.control.value});
   detail('Settings updated',info([['Business name',updated.businessName],['Callback URL',updated.webhookUrl||'Not configured']]));
  }catch(err){detail('Settings not saved',notice(err.message,true));}
  finally{save.disabled=false;}
 });
 add(p,form);
 const b=panel('Workspace identity','Your changes are recorded by the platform.');
 add(b,info([['Merchant ID',data.merchantId],['Email',data.contactEmail],['Time zone',data.timeZone]]));
 return[p,b];
}
async function invitationEmail(){
 if(user?.role!=='SUPER_ADMIN')return[panel('Access denied','Only the platform owner can connect an invitation email account.')];
 const d=await api('/gmail/sender');
 const p=panel('Personal Gmail sender','Use Google permission to send invitations from your own Gmail address. No inbox-reading permission is requested.');
 add(p,info([['Sender',d.email||'Not connected'],['Connection',d.connected?'Connected':'Not connected'],['Google authorization',d.oauthReady?'Available':'Google OAuth client must be configured in Render']]));
 if(d.connected) add(p,button('Disconnect Gmail',async()=>{
  if(!confirm('Disconnect this Gmail account from invitation sending?'))return;
  try{await api('/gmail/disconnect','POST',{});void render('invite-email');}catch(e){detail('Disconnect failed',notice(e.message,true));}
 }));
 else if(d.oauthReady)add(p,button('Connect my Gmail',async()=>{
  try{const r=await api('/gmail/connect','POST',{});const url=new URL(r.authorizationUrl);if(url.hostname!=='accounts.google.com')throw Error('Unexpected Google authorization URL');location.assign(url.href);}
  catch(e){detail('Gmail connection unavailable',notice(e.message,true));}
 },'primary-button'));
 else add(p,notice('Set GMAIL_SEND_CLIENT_ID and GMAIL_SEND_CLIENT_SECRET in Render and allow the callback URL shown below in Google Cloud OAuth settings.'));
 add(p,info([['Google OAuth redirect URL',d.redirectUri||'Not configured'],['Scope','gmail.send only']]));
 const about=panel('Invitation workflow','Once connected, Create Merchant and Invite Owner will send emails from this Gmail account.');
 add(about,notice('If Gmail is not configured, the application provides a one-time private activation link instead. No invitation is marked sent unless Google accepts it.'));
 return[p,about];
}
async function security(){const r=await Promise.all([api('/me'),api('/sessions')]),u=r[0].user||user,p=panel('Your profile','Account access is governed by your backend permissions.');add(p,info([['Email',u.email],['Role',u.role],['Merchant ID',u.merchantId||'Platform team'],['MFA',u.mfaEnabled?'Enabled':'Not enabled'],['Email verified',u.emailVerified?'Yes':'Not yet']]));const perms=panel('Permissions','These permissions also apply on the server.');const tags=el('div','toolbar');(u.permissions||[]).forEach(x=>add(tags,el('span','status-tag',x)));add(perms,tags);const active=panel('Active sessions','Sign out when you finish.');add(active,table(['Created','Expiry'],r[1].sessions||[],x=>[date(x.created_at),date(x.expires_at)]));return[p,perms,active];}
$('merchant-scope').addEventListener('change',e=>{selectedMerchantId=e.target.value;$('merchant-scope-note').textContent=selectedMerchantId?'Reviewing merchant configuration as a platform operator.':'Platform-wide overview.';void render(current);});
// Owner invitations are one-time URL fragments; the token is not sent to the
// server until a person explicitly submits the password creation form.
let ownerInvitationToken='';
function initOwnerInvitation(){
 const prefix='#owner-invitation/';
 if(!location.hash.startsWith(prefix))return;
 try{ownerInvitationToken=decodeURIComponent(location.hash.slice(prefix.length));}catch{return;}
 if(!ownerInvitationToken||ownerInvitationToken.length>512)return;
 $('login-form').hidden=true;
 $('owner-invitation-panel').hidden=false;
 $('owner-invite-password').focus();
}
$('owner-invitation-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const submit=$('owner-invite-submit'),error=$('owner-invite-error');
 error.hidden=true;
 const password=$('owner-invite-password').value,confirm=$('owner-invite-confirm').value;
 if(password!==confirm){error.textContent='The passwords must match.';error.hidden=false;return;}
 if(!ownerInvitationToken){error.textContent='This invitation link is missing or invalid.';error.hidden=false;return;}
 submit.disabled=true;
 try{
  const r=await fetch(API+'/owner-invitations/accept',{method:'POST',credentials:'omit',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({token:ownerInvitationToken,password})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(result.error||'The activation link is invalid or expired.');
  ownerInvitationToken='';
  history.replaceState(null,'',location.pathname+location.search);
  $('owner-invitation-panel').hidden=true;
  $('login-form').hidden=false;
  $('owner-invitation-form').reset();
  $('auth-error').textContent='Account activated. Sign in using the email address on your invitation.';
  $('auth-error').hidden=false;
  $('email').focus();
 }catch(err){error.textContent=err.message;error.hidden=false;}
 finally{submit.disabled=false;}
});
initOwnerInvitation();
window.addEventListener('hashchange',initOwnerInvitation);
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('login-submit');b.disabled=true;$('auth-error').hidden=true;try{await signin($('email').value.trim(),$('password').value);}catch(err){$('auth-error').hidden=false;$('auth-error').textContent=err.message;}finally{b.disabled=false;$('password').value='';}});
$('logout-button').addEventListener('click',signout);
$('refresh-button').addEventListener('click',()=>{void health();void render(current);});
document.querySelectorAll('.nav-item').forEach(x=>x.addEventListener('click',()=>select(x.dataset.view)));
$('sidebar-toggle').addEventListener('click',()=>{const isOpen=$('sidebar').classList.toggle('open');$('sidebar-toggle').setAttribute('aria-expanded',String(isOpen));});
$('detail-close').addEventListener('click',closeDetail);document.querySelectorAll('[data-dismiss]').forEach(x=>x.addEventListener('click',closeDetail));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detail-layer').hidden)closeDetail();});
void restore();