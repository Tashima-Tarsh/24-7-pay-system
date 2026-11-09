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
const titles={overview:['YOUR WORKSPACE','A clearer view of your day.','Real activity from your account. No sample transactions.'],payments:['PAYMENTS','Every order, easier to find.','Follow orders and understand their status.'],merchants:['PLATFORM','Your merchants, at a glance.','Businesses available to your platform role.'],operations:['OPERATIONS','Know what needs attention.','Provider connections, callbacks and operating health.'],cases:['SUPPORT','Keep questions in one place.','A clear history when a payment needs attention.'],receiving:['RECEIVING ACCOUNTS','Know where payments are going.','Check and manage your receiving accounts.'],developers:['INTEGRATIONS','Connect your business.','API keys, configuration and callback deliveries.'],security:['ACCOUNT','Your account, your control.','Access, permissions and active sessions.'],
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
async function health(){let data;try{const r=await fetch('/health',{credentials:'omit',cache:'no-store'});data=await r.json();}catch{data={apiOnline:false,financialReady:false};}
  const flag=$('connection-status'),banner=$('financial-banner');flag.textContent=data.apiOnline?'Service online':'Service unavailable';flag.classList.toggle('degraded',!data.apiOnline||!data.financialReady);
  banner.hidden=!!data.financialReady;if(!banner.hidden)banner.textContent=data.apiOnline?'Live financial actions are paused until durable storage and provider verification are ready. Existing records can still be reviewed.':'The payment service is temporarily unavailable.';return data;}
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
try{let parts;if(name==='overview')parts=await overview();else if(name==='payments')parts=await payments();else if(name==='merchants')parts=await merchants();else if(name==='operations')parts=await operations();else if(name==='cases')parts=await cases();else if(name==='receiving')parts=await receiving();else if(name==='developers')parts=await developers();else if(name==='connections')parts=await connections();else if(name==='policies')parts=await policies();else if(name==='callbacks')parts=await callbacks();else if(name==='billing')parts=await billing();else if(name==='team')parts=await team();else if(name==='settings')parts=await settings();else parts=await security();if(version===renderVersion&&name===current)content.replaceChildren(...parts);}catch(e){if(version===renderVersion&&name===current){const p=panel('This section needs attention','The other workspace sections remain available.');add(p,el('p','notice error',e.message),button('Try again',()=>render(name)));content.replaceChildren(p);}}}
async function overview(){const result=[];if(allowed('transactions.read')){const a=await api('/analytics');result.push(stats([['Recorded payments',count(a.transactions),'Orders in your account'],['Confirmed',count(a.successful),'Verified results'],['In progress',count(a.pending),'Awaiting an outcome'],['Confirmed value',currency(a.successfulAmountPaise),'Excludes cash on delivery']]));const d=await api('/transactions?limit=6'),c=panel('Recent payments','Actual order data, not a simulated dashboard.');add(c,table(['Order','Amount','Status','Created'],d.items||[],r=>[el('span','mono',r.order_id||r.id),currency(r.amount_paise),status(r.status),date(r.created_at)],r=>transaction(r.id)));result.push(c);}
if(user.platform&&allowed('merchants.read')){const m=await api('/merchants?limit=1');result.unshift(stats([['Merchants',count(m.total),'Registered accounts'],['Control center','Platform','Your operator workspace']]));}
if(!user.platform){const c=panel('Your account','Workspace access');add(c,info([['Business ID',user.merchantId],['Signed in as',user.email],['Role',user.role]]));result.push(c);}
if(!result.length){const c=panel('Welcome','Choose a section to get started.');add(c,notice('Your account permissions determine which tools are available.'));result.push(c);}return result;}
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
    if(data.invitationPath)add(summary,notice('One-time invitation path: '+data.invitationPath+' — share privately with this owner.'));
    detail('Merchant created',summary);
    await loadMerchants();void render('merchants');
   }catch(err){detail('Merchant not created',notice(err.message,true));}finally{submit.disabled=false;}
  });
  add(create,form);result.unshift(create);
 }
 return result;}
async function operations(){const r=await api('/operations/health'),c=r.callbacks||{};const metrics=stats([['Delivered callbacks',count(c.successful),'Delivery records'],['Pending callbacks',count(c.pending),'Awaiting delivery'],['Failed callbacks',count(c.failed),'Need attention'],['Providers',count(r.providers?.length),'Configured records']]);const providers=panel('Provider connections','Live backend configuration status');add(providers,table(['Name','Status','Last check'],r.providers||[],p=>[p.provider_name,status(p.status),date(p.last_tested_at)]));const observers=panel('Additional observations','Notifications are supplementary, not proof of bank credit');add(observers,table(['Device','Active','Last heartbeat'],r.observers||[],o=>[o.device_name||o.id,status(o.is_active?'ACTIVE':'INACTIVE'),date(o.last_heartbeat_at)]));return[metrics,providers,observers];}
async function cases(){const d=await api('/cases?limit=50'),c=panel('Support cases','Select a case to see its history');add(c,table(['Subject','Category','Status','Updated'],d.items||[],x=>[x.title,x.kind,status(x.status),date(x.updated_at)],async x=>{try{detail('Case details',await api('/cases/'+encodeURIComponent(x.id)));}catch(e){detail('Case',notice(e.message,true));}}));const result=[c];if(!user.platform&&allowed('operations.write')){const p=panel('Ask for help','Tell your team what happened.');const form=el('form','form-grid'),title=field('Subject','text','title',{required:true,maxlength:200}),desc=field('What happened?','textarea','description',{required:true}),submit=el('button','primary-button','Create support case');submit.type='submit';add(form,title.container,desc.container,add(el('div','form-actions'),submit));form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{await api('/cases','POST',{kind:'SUPPORT',merchantId:user.merchantId,title:title.control.value,description:desc.control.value});void render('cases');}catch(err){detail('Unable to open case',notice(err.message,true));}finally{submit.disabled=false;}});add(p,form);result.unshift(p);}return result;}
function merchantSelectionCard(){const card=panel('Choose a merchant','Select a business at the top of the workspace to access its settings.');add(card,notice('This does not impersonate a merchant. Access controls remain enforced by the server.'));return card;}
async function receiving(){if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];const d=await api('/receiving-accounts'),c=panel('Receiving accounts','Only accounts belonging to this business are shown.');add(c,table(['Payee','UPI ID','Status','Change'],d.accounts||[],a=>[a.payeeName||a.payee_name,el('span','mono',a.upiId||a.upi_id),status(a.isActive||a.is_active?'ACTIVE':'INACTIVE'),button(a.isActive||a.is_active?'Disable':'Enable',async()=>{if(!confirm('Update this receiving account?'))return;try{await api('/receiving-accounts/'+encodeURIComponent(a.id)+'/state','POST',{active:!(a.isActive||a.is_active)});void render('receiving');}catch(err){detail('Account update failed',notice(err.message,true));}})]));const p=panel('Add a receiving account','New accounts start inactive until you choose to enable them.'),form=el('form','form-grid'),vpa=field('UPI ID','text','upiId',{required:true,maxlength:120,placeholder:'merchant@bank'}),name=field('Payee name','text','payeeName',{required:true,maxlength:150}),submit=el('button','primary-button','Add account');submit.type='submit';add(form,vpa.container,name.container,add(el('div','form-actions'),submit));form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{await api('/receiving-accounts','POST',{upiId:vpa.control.value,payeeName:name.control.value});void render('receiving');}catch(err){detail('Account not added',notice(err.message,true));}finally{submit.disabled=false;}});add(p,form);return[c,p];}
async function developers(){if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];const settled=await Promise.allSettled([api('/integration-readiness'),api('/api-keys'),api('/webhook-deliveries')]);const p=panel('Integration readiness','Your backend checks whether the merchant configuration is complete.');if(settled[0].status==='fulfilled'){const d=settled[0].value;add(p,info([['Ready to configure',d.configurationReady?'Yes':'Not yet'],['Status',d.message||d.reason||'Review your account settings']]));}else add(p,notice(settled[0].reason.message,true));const k=panel('Your API keys','Existing secret values are never shown.');if(settled[1].status==='fulfilled')add(k,table(['Label','Environment','Scopes','State'],settled[1].value.keys||[],x=>[x.label,x.environment,(x.scopes||[]).join(', '),status(x.revokedAt?'REVOKED':'ACTIVE')]));else add(k,notice(settled[1].reason.message,true));const w=panel('Callback deliveries','See if an event reached your application.');if(settled[2].status==='fulfilled')add(w,table(['Event','State','Attempts','Created'],settled[2].value.deliveries||[],x=>[x.event_type||x.eventType,status(x.is_successful?'DELIVERED':'PENDING'),count(x.attempt_count),date(x.created_at)]));else add(w,notice(settled[2].reason.message,true));return[p,k,w];}
async function connections(){
 const data=await api('/connections'),c=panel('Payment connections','These are the connections actually configured in your backend.');
 add(c,table(['Provider','Environment','Status','Approved','Enabled'],data.connections||[],r=>[r.provider,r.environment,status(r.status),r.approved?'Yes':'No',r.enabled?'Yes':'No']));
 add(c,notice('Provider readiness depends on approved credentials, active receiving accounts and live provider checks. A connected label alone does not confirm a transfer.'));
 return[c];
}
async function policies(){
 const data=await api('/rules'),c=panel('Payment rules','An overview of the conditions defined for your merchant or platform.');
 add(c,table(['Rule','Target','Status','Reason'],data.rules||[],r=>[r.ruleType+' · '+r.targetType,r.target,status(r.active?'ACTIVE':'INACTIVE'),r.reason]));
 return[c];
}
async function callbacks(){if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];
 const data=await api('/webhook-deliveries'),c=panel('Callback deliveries','Whether an event was sent successfully, is pending or requires attention.');
 add(c,table(['Event','Delivery','Attempts','Response'],data.deliveries||[],r=>[r.event_type,status(r.is_successful?'DELIVERED':'PENDING'),count(r.attempt_count),r.response_status||'—']));
 add(c,notice('A delivered callback indicates a successful HTTP response, not a separate bank-credit confirmation.'));
 return[c];
}
async function billing(){
 const [invoices,subscriptions]=await Promise.allSettled([api('/billing/invoices?limit=30'),api('/billing/subscriptions?limit=30')]);
 const a=panel('Your invoices','Billing records saved for this account.');
 if(invoices.status==='fulfilled')add(a,table(['Invoice','Status','Period','Amount'],invoices.value.items||[],r=>[r.invoice_number||r.id,status(r.status),r.period_start||r.period_end,currency(r.total_paise||r.amount_paise||0)]));
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
async function security(){const r=await Promise.all([api('/me'),api('/sessions')]),u=r[0].user||user,p=panel('Your profile','Account access is governed by your backend permissions.');add(p,info([['Email',u.email],['Role',u.role],['Merchant ID',u.merchantId||'Platform team'],['MFA',u.mfaEnabled?'Enabled':'Not enabled'],['Email verified',u.emailVerified?'Yes':'Not yet']]));const perms=panel('Permissions','These permissions also apply on the server.');const tags=el('div','toolbar');(u.permissions||[]).forEach(x=>add(tags,el('span','status-tag',x)));add(perms,tags);const active=panel('Active sessions','Sign out when you finish.');add(active,table(['Created','Expiry'],r[1].sessions||[],x=>[date(x.created_at),date(x.expires_at)]));return[p,perms,active];}
$('merchant-scope').addEventListener('change',e=>{selectedMerchantId=e.target.value;$('merchant-scope-note').textContent=selectedMerchantId?'Reviewing merchant configuration as a platform operator.':'Platform-wide overview.';void render(current);});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('login-submit');b.disabled=true;$('auth-error').hidden=true;try{await signin($('email').value.trim(),$('password').value);}catch(err){$('auth-error').hidden=false;$('auth-error').textContent=err.message;}finally{b.disabled=false;$('password').value='';}});
$('logout-button').addEventListener('click',signout);
$('refresh-button').addEventListener('click',()=>{void health();void render(current);});
document.querySelectorAll('.nav-item').forEach(x=>x.addEventListener('click',()=>select(x.dataset.view)));
$('sidebar-toggle').addEventListener('click',()=>{const isOpen=$('sidebar').classList.toggle('open');$('sidebar-toggle').setAttribute('aria-expanded',String(isOpen));});
$('detail-close').addEventListener('click',closeDetail);document.querySelectorAll('[data-dismiss]').forEach(x=>x.addEventListener('click',closeDetail));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detail-layer').hidden)closeDetail();});
void restore();