const API='/api/platform/v1',KEY='247pay-new-workspace-session';
const $=x=>document.getElementById(x);
let token=sessionStorage.getItem(KEY)||'',user=null,current='overview',renderVersion=0,stream=null,heartbeat=null;
let selectedMerchantId='',merchantDirectory=[];
const scopedEndpoints=['/receiving-accounts','/api-keys','/api-usage','/integration-readiness','/webhook-deliveries','/webhooks/test','/settings'];
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
// Progressive, accessible workspace enhancements. No payment-state mutation.
// Self-hosted official Phosphor regular SVGs, no external runtime or icon-font dependency.
function premiumIcon(name){
 const img=el('img','studio-phosphor-icon');
 img.src='/assets/icons/phosphor-'+(new Set(['chart','route','shield','code']).has(name)?name:'shield')+'.svg';
 img.width=22;img.height=22;img.alt='';img.setAttribute('aria-hidden','true');
 return img;
}
function premiumChart(summary){
 const rows=[['Confirmed',Math.max(0,Number(summary.confirmed)||0),'#196B4B'],['Pending',Math.max(0,Number(summary.pending)||0),'#D9AC63'],['Failed',Math.max(0,Number(summary.failed)||0),'#B84D2F']];
 const declared=Math.max(0,Number(summary.transactions)||0),known=rows.reduce((n,r)=>n+r[1],0);
 if(declared>known)rows.push(['Other',declared-known,'#A0ACA0']);
 const total=rows.reduce((n,r)=>n+r[1],0),card=panel('Payment mix','Backend KPI results. Counts are orders, not bank settlement totals.');
 const layout=el('div','studio-chart-layout'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 220 220');svg.setAttribute('width','220');svg.setAttribute('height','220');
 svg.setAttribute('role','img');svg.setAttribute('aria-label','Backend payment status distribution: '+rows.map(r=>r[0]+' '+count(r[1])).join(', '));
 const circle=(radius,stroke,angle,amount)=>{
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx','110');c.setAttribute('cy','110');c.setAttribute('r',String(radius));c.setAttribute('fill','none');
  c.setAttribute('stroke',stroke);c.setAttribute('stroke-width','23');c.setAttribute('transform','rotate(-90 110 110)');
  if(amount!==undefined){const circumference=2*Math.PI*radius;c.setAttribute('stroke-dasharray',String(amount*circumference)+' '+String(circumference));c.setAttribute('stroke-dashoffset',String(-angle*circumference));}
  return c;
 };
 svg.appendChild(circle(76,'#E6E9E3'));
 let offset=0;
 for(const [label,n,color] of rows){if(n>0&&total>0){const share=n/total;svg.appendChild(circle(76,color,offset,share));offset+=share;}}
 const center=document.createElementNS('http://www.w3.org/2000/svg','text');center.setAttribute('x','110');center.setAttribute('y','106');center.setAttribute('text-anchor','middle');center.setAttribute('font-size','29');center.setAttribute('font-weight','700');center.setAttribute('fill','#183D30');center.textContent=count(total);svg.appendChild(center);
 const subtitle=document.createElementNS('http://www.w3.org/2000/svg','text');subtitle.setAttribute('x','110');subtitle.setAttribute('y','128');subtitle.setAttribute('text-anchor','middle');subtitle.setAttribute('font-size','12');subtitle.setAttribute('fill','#607062');subtitle.textContent='orders';svg.appendChild(subtitle);
 const legend=el('div','studio-chart-legend');
 for(const [label,n,color] of rows){const row=el('div','studio-chart-item'),dot=el('span','studio-chart-dot');dot.style.backgroundColor=color;add(row,dot,el('span','',label),el('strong','',count(n)),el('small','',total?(100*n/total).toFixed(1)+'%':'0.0%'));add(legend,row);}
 add(layout,svg,legend);add(card,layout);return card;
}
function premiumEntryPoints(){
 const p=panel('Your command centre','Jump into live payment operations. These tools use your existing authenticated backend.');
 const grid=el('div','studio-quick-actions');
 for(const [name,title,desc,view] of [
  ['chart','Transactions','Review recorded payments','payments'],
  ['route','Routing','Inspect provider eligibility','operations'],
  ['shield','Verification','Audit confirmations','verification'],
  ['code','Developers','API keys and documentation','developers']
 ]){
  const b=el('button','studio-quick-action');b.type='button';b.setAttribute('aria-label',title+': '+desc);
  add(b,premiumIcon(name),add(el('span','studio-quick-action-text'),el('strong','',title),el('small','',desc)));
  b.addEventListener('click',()=>select(view));add(grid,b);
 }
 add(p,grid);return p;
}
function premiumAnimate(root){
 if(!root||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 if(!Element.prototype.animate)return;
 root.querySelectorAll('.panel-card,.metric').forEach((node,i)=>{
  node.animate([{opacity:.65,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:270,delay:Math.min(i*25,180),easing:'cubic-bezier(.2,.8,.2,1)'});
 });
}

function paymentDistribution(summary){
 const entries=[
  ['Confirmed',summary.confirmed,'confirmed'],
  ['Pending',summary.pending,'pending'],
  ['Failed / expired',summary.failed,'failed']
 ];
 const total=Number(summary.transactions)||0;
 const section=panel('Payment outcome distribution','Computed from real dashboard totals. Unclassified orders are shown separately.');
 const bar=el('div','premium-outcome-bar');bar.setAttribute('role','img');bar.setAttribute('aria-label','Payment outcomes as a percentage of all recorded orders');
 const legend=el('div','premium-outcome-legend');
 let used=0;
 for(const [label,raw,tone] of entries){
  const number=Math.max(0,Number(raw)||0),percentage=total>0?Math.min(100,number/total*100):0;
  used+=number;
  if(percentage>0){const segment=el('span','premium-segment '+tone);segment.style.width=percentage+'%';segment.title=label+': '+count(number)+' ('+percentage.toFixed(1)+'%)';add(bar,segment);}
  const item=el('div','premium-outcome-item');
  add(item,el('span','premium-outcome-dot '+tone),el('span','premium-outcome-label',label),el('strong','',count(number)),el('span','premium-outcome-percent',percentage.toFixed(1)+'%'));
  add(legend,item);
 }
 const unknown=Math.max(0,total-used);
 if(unknown){const percentage=total>0?unknown/total*100:0;const segment=el('span','premium-segment other');segment.style.width=percentage+'%';add(bar,segment);add(legend,add(el('div','premium-outcome-item'),el('span','premium-outcome-dot other'),el('span','premium-outcome-label','Other recorded states'),el('strong','',count(unknown)),el('span','premium-outcome-percent',percentage.toFixed(1)+'%')));}
 if(!total)add(bar,el('span','premium-outcome-empty','No orders recorded yet'));
 add(section,bar,legend);
 return section;
}

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
try{let parts;if(name==='overview')parts=await overview();else if(name==='payments')parts=await payments();else if(name==='merchants')parts=await merchants();else if(name==='operations')parts=await operations();else if(name==='verification')parts=await verification();else if(name==='invite-email')parts=await invitationEmail();else if(name==='diagnostics')parts=await diagnostics();else if(name==='cases')parts=await cases();else if(name==='receiving')parts=await receiving();else if(name==='developers')parts=await developers();else if(name==='connections')parts=await connections();else if(name==='policies')parts=await policies();else if(name==='callbacks')parts=await callbacks();else if(name==='billing')parts=await billing();else if(name==='team')parts=await team();else if(name==='settings')parts=await settings();else parts=await security();if(version===renderVersion&&name===current){content.replaceChildren(...parts);premiumAnimate(content);}}catch(e){if(version===renderVersion&&name===current){const p=panel('This section needs attention','The other workspace sections remain available.');add(p,el('p','notice error',e.message),button('Try again',()=>render(name)));content.replaceChildren(p);}}}
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
  result.unshift(premiumEntryPoints());
  result.push(premiumChart(s));
  result.push(paymentDistribution(s));
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
async function payments(){
 const scope=user.platform&&selectedMerchantId?'&merchantId='+encodeURIComponent(selectedMerchantId):'';
 const d=await api('/transactions?limit=50'+scope),rows=d.items||[];
 const c=panel('Payment history','Search and filter the latest 50 backend records. Open a payment for its source-backed event history.');
 const toolbar=el('div','premium-payment-toolbar');
 const search=el('input');search.type='search';search.placeholder='Search order, method or status';search.setAttribute('aria-label','Search payment records');
 const filter=el('select');filter.setAttribute('aria-label','Filter payment status');
 for(const [label,v] of [['All statuses',''],['Confirmed','confirmed'],['Pending','pending'],['Failed or expired','failed']])filter.add(new Option(label,v));
 const counter=el('span','premium-result-count');counter.setAttribute('aria-live','polite');
 const area=el('div');
 const stateOf=x=>String(x.status||'').toUpperCase();
 const passes=x=>{
  const state=stateOf(x);
  if(filter.value==='confirmed'&&!['SUCCESS','SUCCEEDED','CONFIRMED','COMPLETED'].includes(state))return false;
  if(filter.value==='pending'&&!['PENDING','PROCESSING','REQUIRES_CUSTOMER_ACTION','CREATED','INITIATED'].includes(state))return false;
  if(filter.value==='failed'&&!['FAILED','EXPIRED','CANCELLED','CANCELED','BLOCKED'].includes(state))return false;
  const haystack=[x.order_id,x.id,x.status,x.method].map(v=>String(v??'')).join(' ').toLowerCase();
  return haystack.includes(search.value.trim().toLowerCase());
 };
 const paint=()=>{
  const matches=rows.filter(passes);
  counter.textContent=count(matches.length)+' of '+count(rows.length)+' loaded orders';
  area.replaceChildren(table(['Order','Amount','Method','Status','Created'],matches,
   x=>[el('span','mono',x.order_id||x.id),currency(x.amount_paise),x.method,status(x.status),date(x.created_at)],x=>transaction(x.id)));
 };
 search.addEventListener('input',paint);filter.addEventListener('change',paint);
 add(toolbar,search,filter,counter);paint();add(c,toolbar,area,
  notice('This view shows at most 50 loaded orders, not a full-history export. Payment status is sourced from your backend.'));
 const result=[c];
 if(!user.platform&&allowed('payments.create')){
  const p=panel('Create a payment request','This uses your real payment configuration, not a demo.');
  const form=el('form','form-grid'),order=field('Order reference','text','orderId',{required:true,pattern:'[-A-Za-z0-9_]{1,120}',maxlength:120}),amount=field('Amount in rupees','number','amount',{required:true,min:0.01,step:0.01});
  order.control.value='ORDER-'+Date.now();
  const submit=el('button','primary-button','Create payment');submit.type='submit';
  add(form,order.container,amount.container,add(el('div','form-actions'),submit));
  form.addEventListener('submit',async e=>{
   e.preventDefault();submit.disabled=true;
   try{
    const r=await api('/payments','POST',{orderId:order.control.value,amount:amount.control.value,currency:'INR'},{'Idempotency-Key':crypto.randomUUID()});
    const body=info([['Order',r.orderId],['Amount',r.amount],['Status',r.status]]);
    if(r.checkoutUrl){const u=new URL(r.checkoutUrl,location.origin);if(u.origin===location.origin)add(body,add(el('p'),(()=>{const a=el('a','card-link','Open customer checkout');a.href=u.pathname;return a;})()));}
    detail('Payment request',body);void render('payments');
   }catch(err){detail('Payment not created',notice(err.message,true));}
   finally{submit.disabled=false;}
  });
  add(p,form);result.unshift(p);
 }
 return result;
}

function paymentEventTimeline(events,transaction){
 const list=el('ol','payment-timeline');
 list.setAttribute('aria-label','Payment history and callback timeline');
 const allowedKeys=['previous_status','new_status','response_status','attempt_count','source',
  'attribution_status','actor_type','amount_paise','bank_reference_number'];
 const items=Array.isArray(events)&&events.length?events:[{event_type:'PAYMENT_RECORDED',new_status:transaction.status,created_at:transaction.created_at}];
 for(const event of items){
  const type=String(event.event_type||event.action||'PAYMENT_EVENT').toUpperCase();
  const isCallback=type==='CALLBACK_DELIVERY';
  const isObservation=type==='SUPPLEMENTARY_OBSERVATION';
  const rawStatus=String(event.new_status||event.status||'').toUpperCase();
  const failed=['FAILED','EXPIRED','CANCELLED','BLOCKED'].includes(rawStatus);
  const done=['SUCCESS','SUCCEEDED','CONFIRMED'].includes(rawStatus);
  const variant=isCallback?(event.is_successful?'delivered':'processing'):isObservation?'observed':failed?'failed':done?'success':'pending';
  const title=isCallback?(event.is_successful?'Callback acknowledged':'Callback delivery attempt'):
   isObservation?'Supplementary observation (not payment proof)':
   type.replace(/_/g,' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
  const stateNote=isCallback?'HTTP acknowledgement is separate from confirmation of funds':
   isObservation?'A notification or observation cannot independently confirm bank credit':
   rawStatus?'Recorded state: '+rawStatus.replace(/_/g,' '):'Recorded payment event';
  const item=el('li','payment-timeline-item '+variant),dot=el('span','payment-timeline-dot',variant==='success'?'✓':variant==='failed'?'×':variant==='delivered'?'↗':variant==='observed'?'!':'•');
  dot.setAttribute('aria-hidden','true');
  const head=el('div','payment-timeline-heading'),titleNode=el('strong','',title);
  const when=el('time','payment-timeline-time',date(event.created_at||event.observed_at||event.ingested_at));
  if(event.created_at)when.dateTime=event.created_at;
  add(head,titleNode,when);
  const detailNode=el('p','payment-timeline-description',stateNote);
  const metadata=el('dl','payment-timeline-meta');
  for(const key of allowedKeys){
   const value=event[key];
   if(value===null||value===undefined||value==='')continue;
   let display=String(value);
   if(key==='bank_reference_number')display=display.length>4?'••••'+display.slice(-4):'••••';
   if(display.length>160)display=display.slice(0,160)+'…';
   const label=el('dt','',key.replace(/_/g,' ')),result=el('dd','',display);
   add(metadata,label,result);
  }
  const card=el('div','payment-timeline-card');
  add(card,head,detailNode);
  if(metadata.children.length)add(card,metadata);
  add(item,dot,card);add(list,item);
 }
 return list;
}
async function transaction(id){
 try{
  const r=await api('/transactions/'+encodeURIComponent(id)),x=r.transaction||{},box=el('div');
  add(box,info([['Order',x.order_id||x.id],['Payment ID',x.id],['Amount',currency(x.amount_paise)],
    ['Method',x.method],['Recorded status',x.status],['Created',date(x.created_at)]]));
  const section=panel('Payment event timeline','Stored state changes, supplementary evidence and callback delivery results, shown separately.');
  add(section,paymentEventTimeline(r.timeline,x),
    notice('A delivered callback confirms HTTP delivery only. Bank settlement must be reconciled separately.'));
  add(box,section);
  detail('Payment details',box);
 }catch(err){detail('Payment details',notice(err.message,true));}
}
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
async function operations(){
 const scope=user.platform&&selectedMerchantId?'?merchantId='+encodeURIComponent(selectedMerchantId):'';
 const [healthResult,connectionsResult,rulesResult]=await Promise.allSettled([
  api('/operations/health'+scope),
  api('/connections'+scope),
  api('/rules')
 ]);
 if(healthResult.status!=='fulfilled')throw healthResult.reason;
 const r=healthResult.value,c=r.callbacks||{},result=[];
 const metrics=stats([
  ['Delivered callbacks',count(c.successful),'HTTP-acknowledged delivery records'],
  ['Pending callbacks',count(c.pending),'Awaiting delivery'],
  ['Failed callbacks',count(c.failed),'Delivery records needing attention'],
  ['Providers',count(r.providers?.length),'Configured provider records']
 ]);
 result.push(metrics);
 const providerPanel=panel('Provider health','Current backend provider status and diagnostic history. A connection test is not a successful payment.');
 add(providerPanel,table(['Provider','Status','Last check'],r.providers||[],p=>[p.provider_name||p.provider||'—',status(p.status),date(p.last_tested_at)]));
 add(providerPanel,button('Manage connections',()=>select('connections')));
 result.push(providerPanel);
 const routing=panel('Routing control plane','Read-only routing inventory based on approved backend connections and payment policy rules.');
 if(connectionsResult.status==='fulfilled'){
  const all=connectionsResult.value.connections||[];
  add(routing,stats([
   ['Connections',count(all.length),'In selected business scope'],
   ['Eligible routes',count(all.filter(x=>x.approved&&x.enabled).length),'Approved and enabled; bank readiness not implied'],
   ['Disabled routes',count(all.filter(x=>!x.enabled).length),'Unavailable for new payment routing']
  ]));
  const board=el('div','premium-route-grid');
  for(const row of all){
   const tile=el('div','premium-route-tile');
   const head=el('div','premium-route-head');
   add(head,el('strong','',row.provider||'Unnamed provider'),status(row.approved&&row.enabled?'ENABLED':row.approved?'DISABLED':'UNAPPROVED'));
   add(tile,head,info([['Environment',row.environment||'—'],['Merchant',row.merchantId||'—'],['Last diagnostics',row.status||'Not tested']]));
   add(board,tile);
  }
  if(!all.length)add(board,notice('No payment connections are configured for this scope.'));
  add(routing,board);
 }else add(routing,notice('Connection inventory unavailable: '+connectionsResult.reason.message,true));
 if(rulesResult.status==='fulfilled'){
  const raw=rulesResult.value.rules||[];
  const all=user.platform&&selectedMerchantId?raw.filter(x=>x.global||x.merchantId===selectedMerchantId):raw;
  add(routing,info([
   ['Active block rules',count(all.filter(x=>x.active&&x.ruleType==='BLOCK').length)],
   ['Active watch rules',count(all.filter(x=>x.active&&x.ruleType==='WATCH').length)],
   ['Active allow rules',count(all.filter(x=>x.active&&x.ruleType==='ALLOW').length)]
  ]));
 }else add(routing,notice('Rules could not be loaded: '+rulesResult.reason.message,true));
 add(routing,add(el('div','toolbar'),button('Manage routes',()=>select('connections')),button('Manage policies',()=>select('policies'))),
  notice('Eligibility is a configuration indicator only. Routing simulations and authorization probabilities are not available in this view.'));
 result.push(routing);
 const observers=panel('Additional observations','Supplementary signals are not proof of bank credit.');
 add(observers,table(['Device','Active','Last heartbeat'],r.observers||[],o=>[o.device_name||o.id,status(o.is_active?'ACTIVE':'INACTIVE'),date(o.last_heartbeat_at)]));
 result.push(observers);
 return result;
}
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
 const rows=data.items||[];
 const reconciliation=rows.filter(x=>String(x.kind||'').toUpperCase()==='RECONCILIATION');
 const disputes=rows.filter(x=>String(x.kind||'').toUpperCase()==='DISPUTE');
 const unresolved=rows.filter(x=>!['CLOSED','RESOLVED'].includes(String(x.status||'').toUpperCase()));
 const summary=panel('Financial investigations','Case counts from the latest 50 backend records. These are workflow cases, not bank-statement reconciliation results.');
 add(summary,stats([
  ['Open investigations',count(unresolved.length),'Unresolved cases in the loaded dataset'],
  ['Reconciliation cases',count(reconciliation.length),'Ledger or bank matching investigations'],
  ['Dispute cases',count(disputes.length),'Customer or merchant disputes']
 ]));
 const filterbar=el('div','premium-payment-toolbar');
 const category=el('select');category.setAttribute('aria-label','Filter case category');
 for(const [label,code] of [['All categories',''],['Reconciliation','RECONCILIATION'],['Disputes','DISPUTE'],['Support','SUPPORT']])category.add(new Option(label,code));
 const state=el('select');state.setAttribute('aria-label','Filter case state');
 for(const [label,code] of [['All states',''],['Unresolved','unresolved'],['Resolved or closed','resolved']])state.add(new Option(label,code));
 const counter=el('span','premium-result-count');counter.setAttribute('aria-live','polite');
 add(filterbar,category,state,counter);
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
 const area=el('div');
 const paint=()=>{
  const visible=rows.filter(x=>{
   if(category.value&&String(x.kind||'').toUpperCase()!==category.value)return false;
   const finished=['RESOLVED','CLOSED'].includes(String(x.status||'').toUpperCase());
   if(state.value==='unresolved'&&finished)return false;
   if(state.value==='resolved'&&!finished)return false;
   return true;
  });
  counter.textContent=count(visible.length)+' of '+count(rows.length)+' loaded cases';
  area.replaceChildren(table(['Subject','Merchant','Category','Status','Updated'],visible,
   x=>[x.title,x.merchant_id||'Platform',x.kind,status(x.status),date(x.updated_at)],openCase));
 };
 category.addEventListener('change',paint);state.addEventListener('change',paint);paint();
 add(c,filterbar,area,notice('Filters apply to the most recent 50 cases. Settlement verification requires authoritative bank or PSP records.'));
 const result=[summary,c];
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
 const setup=panel('Merchant API integration','Use these server-to-server tools to create payment sessions and receive signed status callbacks.');
 const baseUrl=location.origin;
 add(setup,info([['API origin',baseUrl],['Payment creation','POST /api/v1/payments'],['Payment status','GET /api/v1/payments/:id'],
 ['Callback authentication','Verify raw-body HMAC and deduplicate event IDs'],['Public documentation','docs/developers/WEBHOOK_INTEGRATION.md']]));
 const docs=el('a','card-link','Read webhook integration guide on GitHub');
 const reference=el('a','card-link','Explore interactive API reference');reference.href='/api-reference.html';reference.target='_blank';reference.rel='noopener noreferrer';add(setup,reference);
 docs.href='https://github.com/Tashima-Tarsh/24-7-pay-system/blob/main/docs/developers/WEBHOOK_INTEGRATION.md';
 docs.target='_blank';docs.rel='noopener noreferrer';add(setup,docs);
 if(allowed('credentials.manage')&&allowed('webhooks.manage')){
  const packBtn=button('Generate integration pack',async()=>{
   if(!confirm('Create a new production API credential and show integration secrets once? The merchant must be fully configured.'))return;
   try{
    const pack=await api('/integration-pack','POST',{label:'Business integration'});
    const body=el('div'),copy=button('Copy integration JSON',async()=>{
     try{await navigator.clipboard.writeText(JSON.stringify(pack,null,2));copy.textContent='Copied';}
     catch{copy.textContent='Copy unavailable';}
    });
    const secretInfo=el('pre','mono',JSON.stringify(pack,null,2));
    add(body,notice('This information contains credentials. Save it privately now; the API secret will not be displayed again.'),
      secretInfo,copy);
    detail('One-time integration pack',body);
    void render('developers');
   }catch(err){detail('Integration pack unavailable',notice(err.message,true));}
  },'primary-button');
  add(setup,packBtn);
 }
 result.push(setup);
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
function webhookTester(savedUrl){
 const p=panel('Test webhook endpoint','Send one signed WEBHOOK_TEST event to the saved destination; no payment is created.');
 if(savedUrl===null) add(p,notice('Uses the webhook URL saved for this merchant. The test works without sending any money.'));
 else if(!savedUrl){add(p,notice('No webhook destination is configured. Set your public HTTPS callback URL in Business settings first.'));return p;}
 else add(p,info([['Saved destination',savedUrl],['Signature format','X-Gateway-Signature: sha256=<HMAC of JSON body>']]));
 const control=button('Send test payload',async()=>{
  control.disabled=true;control.textContent='Testing endpoint…';result.replaceChildren(el('p','notice','Waiting for the merchant endpoint (up to five seconds)…'));
  try{
   const r=await api('/webhooks/test','POST',{});
   result.replaceChildren(info([['Connectivity',r.success?'Acknowledged':'Not acknowledged'],
    ['HTTP status',r.status_code??'No response'],['Round-trip',r.duration_ms+' ms'],
    ['Diagnostic event ID',r.delivery_id],['Outcome',r.message],
    ['Response excerpt',r.response_body||'—']]),
    notice('This is a WEBHOOK_TEST only. No payment success, UTR or bank credit was created.'));
  }catch(err){result.replaceChildren(notice(err.message,true));}
  finally{control.disabled=false;control.textContent='Send test payload';}
 },'primary-button');
 const result=el('div','webhook-test-result');result.setAttribute('role','status');result.setAttribute('aria-live','polite');
 add(p,control,result);
 return p;
}
async function callbacks(){
 if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];
 const result=await api('/webhook-deliveries');
 const entries=Array.isArray(result.deliveries)?result.deliveries:[],c=panel('Callback delivery center','Backend-recorded HTTP delivery results. Filter attempts, inspect transport details and retry only existing events.');
 const toolbar=el('div','premium-payment-toolbar');
 const search=el('input');search.type='search';search.placeholder='Search event or source';search.setAttribute('aria-label','Search callback deliveries');
 const state=el('select');state.setAttribute('aria-label','Filter callback deliveries');
 for(const [label,v] of [['All deliveries',''],['Acknowledged','delivered'],['Retry queued','queued'],['Needs attention','attention']])state.add(new Option(label,v));
 const counter=el('span','premium-result-count');counter.setAttribute('aria-live','polite');
 const area=el('div');
 const deliveryState=row=>row.is_successful?'delivered':row.next_retry_at?'queued':'attention';
 const renderAction=row=>{
  const delivered=Boolean(row.is_successful),wrap=el('div','premium-callback-actions');
  const inspect=button('Inspect',()=>detail('Callback delivery',info([
   ['Event',row.event_type],['Source',row.source],['Delivery ID',row.id],
   ['Transport status',delivered?'HTTP acknowledged':row.next_retry_at?'Retry queued':'Needs attention'],
   ['Attempt count',count(row.attempt_count)],['Last HTTP response',row.response_status||'No recorded HTTP response'],
   ['Next retry',date(row.next_retry_at)]
  ])));
  add(wrap,inspect);
  if(!delivered&&allowed('webhooks.manage'))add(wrap,button('Retry',async()=>{
   if(!confirm('Retry delivering this existing event? This does NOT confirm receipt of money.'))return;
   try{
    await api('/webhook-deliveries/'+encodeURIComponent(row.id)+'/retry','POST',{source:row.source});
    detail('Delivery retry queued',notice('The payment record was not changed. Only callback redelivery was requested.'));
    void render('callbacks');
   }catch(err){detail('Retry unavailable',notice(err.message,true));}
  }));
  return wrap;
 };
 const paint=()=>{
  const q=search.value.trim().toLowerCase();
  const visible=entries.filter(row=>{
   if(state.value&&deliveryState(row)!==state.value)return false;
   return [row.event_type,row.source,row.id,row.response_status].map(v=>String(v??'')).join(' ').toLowerCase().includes(q);
  });
  counter.textContent=count(visible.length)+' of '+count(entries.length)+' recorded deliveries';
  area.replaceChildren(table(['Event','Source','Attempts','HTTP','Next retry','Status','Actions'],visible,
   x=>[x.event_type,x.source||'—',count(x.attempt_count),x.response_status||'—',date(x.next_retry_at),status(deliveryState(x).toUpperCase()),renderAction(x)]));
 };
 add(c,stats([
  ['Delivered',count(entries.filter(x=>x.is_successful).length),'HTTP-acknowledged events'],
  ['Retry pending',count(entries.filter(x=>!x.is_successful&&x.next_retry_at).length),'Delivery queue'],
  ['Needs attention',count(entries.filter(x=>!x.is_successful&&!x.next_retry_at).length),'Inspect and retry carefully']
 ]));
 search.addEventListener('input',paint);state.addEventListener('change',paint);
 add(toolbar,search,state,counter);paint();
 add(c,toolbar,area,notice('Callback acknowledgement is not proof of funds. Confirm payment only through your authoritative provider evidence; deduplicate event IDs and validate webhook signatures.'));
 return[c,webhookTester(null)];
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
async function settings(){
 if(user.platform&&!selectedMerchantId)return[merchantSelectionCard()];
 const data=await api('/settings'),
   main=panel('Business profile and callback configuration','The details merchants see, and the HTTPS endpoint that receives signed payment events.');
 const form=el('form','form-grid'),
  name=field('Business name','text','businessName',{required:true,minlength:2,maxlength:150}),
  url=field('Payment webhook URL (HTTPS)','url','webhookUrl',{placeholder:'https://your-business.example/webhooks/payments'}),
  zone=field('Time zone','text','timeZone',{required:true,placeholder:'Asia/Kolkata'}),
  appName=field('Customer-facing app name','text','appName',{maxlength:120}),
  logoUrl=field('Logo image URL (HTTPS)','url','logoUrl',{placeholder:'https://your-business.example/logo.svg'}),
  brand=field('Brand color (#RRGGBB)','text','primaryColor',{pattern:'#[0-9a-fA-F]{6}',placeholder:'#183D30'}),
  submit=el('button','primary-button','Save business settings');submit.type='submit';
 name.control.value=data.businessName||'';
 url.control.value=data.webhookUrl||'';
 zone.control.value=data.timeZone||'Asia/Kolkata';
 appName.control.value=data.branding?.appName||'';
 logoUrl.control.value=data.branding?.logoUrl||'';
 brand.control.value=data.branding?.primaryColor||'';
 add(form,name.container,url.container,zone.container,appName.container,logoUrl.container,brand.container,
  notice('A callback URL must be publicly reachable over HTTPS. Setting this address does not prove it receives events; check Callback Deliveries after an actual provider-confirmed payment.'),
  add(el('div','form-actions'),submit));
 form.addEventListener('submit',async e=>{
  e.preventDefault();submit.disabled=true;
  try{
   const payload={businessName:name.control.value,webhookUrl:url.control.value,timeZone:zone.control.value,
    branding:{appName:appName.control.value,logoUrl:logoUrl.control.value,primaryColor:brand.control.value}};
   const result=await api('/settings','POST',payload);
   detail('Business settings saved',info([['Business',result.businessName],['Webhook destination',result.webhookUrl||'Not configured'],['Time zone',result.timeZone]]));
   void render('settings');
  }catch(err){detail('Business settings not saved',notice(err.message,true));}
  finally{submit.disabled=false;}
 });
 add(main,form);
 const webhookProbe=webhookTester(data.webhookUrl||'');
 const details=panel('Account ownership','Merchant-scope access is enforced on the backend. Your business cannot access another business’s payment records.');
 add(details,info([['Merchant ID',data.merchantId],['Contact email',data.contactEmail],['Contact phone',data.contactPhone],['Webhook URL',data.webhookUrl||'Not configured']]));
 const link=button('Check callback deliveries',()=>select('callbacks'));add(details,link);
 return[main,webhookProbe,details];
}
async function invitationEmail(){
 if(user?.role!=='SUPER_ADMIN')return[panel('Access denied','Only the platform owner can connect an invitation email account.')];
 const d=await api('/gmail/sender');
 const sender=panel('Personal Gmail sender','Send merchant-owner invitations from a Google account you authorize. Gmail permission is limited to sending email.');
 add(sender,info([['Sender email',d.email||'Not connected'],['Connection',d.connected?'Connected':'Not connected'],
 ['OAuth application',d.oauthReady?'Ready':'Not configured'],['Permission','Gmail send only · Google account email identity']]));
 if(d.connected){
  add(sender,button('Disconnect Gmail',async()=>{
   if(!confirm('Stop sending invitations from this Gmail address?'))return;
   try{const r=await api('/gmail/disconnect','POST',{});detail('Gmail disconnected',notice(r.revocationNote));void render('invite-email');}
   catch(e){detail('Disconnect failed',notice(e.message,true));}
  }));
 }else if(d.oauthReady){
  add(sender,button('Connect my Gmail',async()=>{
   try{const response=await api('/gmail/connect','POST',{});
    const url=new URL(response.authorizationUrl);
    if(url.hostname!=='accounts.google.com'||url.protocol!=='https:')throw Error('Unexpected OAuth authorization address');
    location.assign(url.href);
   }catch(e){detail('Google authorization unavailable',notice(e.message,true));}
  },'primary-button'));
 }
 const setup=panel('Set up your Google OAuth application','This is a one-time setup. The credentials are encrypted on the server and never shown again.');
 const hint=el('p','card-note');hint.textContent='In Google Cloud: enable the Gmail API, configure your OAuth consent screen and create a Web application OAuth client. Add the redirect URL below, then paste the Client ID and Client secret here. You must authorize your own Gmail account before invitations can be sent.';
 add(setup,hint);
 const go=el('a','card-link','Open Google Cloud credentials');go.href='https://console.cloud.google.com/apis/credentials';go.target='_blank';go.rel='noopener noreferrer';add(setup,go);
 add(setup,info([['Authorized redirect URL',d.redirectUri||'Configure your public HTTPS app origin'],
 ['Stored OAuth configuration',d.clientStored?'Saved privately in PostgreSQL':d.oauthReady?'Configured using Render environment':'Not configured']]));
 const form=el('form','form-grid'),id=field('Google OAuth Client ID','text','gmailClientId',{required:true,autocomplete:'off',maxlength:220,placeholder:'1234-name.apps.googleusercontent.com'}),
 secret=field('Google OAuth Client secret','password','gmailClientSecret',{required:true,autocomplete:'new-password',minlength:10,maxlength:300}),
 submit=el('button','primary-button','Save OAuth configuration');submit.type='submit';
 add(form,id.container,secret.container,notice('Changing this OAuth application disconnects the previous Gmail sender. You must reconnect Google after saving.'),
  add(el('div','form-actions'),submit));
 form.addEventListener('submit',async e=>{
  e.preventDefault();submit.disabled=true;
  try{
   const response=await api('/gmail/client','POST',{clientId:id.control.value.trim(),clientSecret:secret.control.value});
   secret.control.value='';
   detail('OAuth application saved',notice('Your OAuth client is stored privately. Connect the Gmail account and approve Google’s permission to send invitations.'));
   void render('invite-email');
  }catch(err){detail('Unable to save OAuth application',notice(err.message,true));}
  finally{submit.disabled=false;}
 });
 add(setup,form);
 const workflow=panel('Merchant invitation workflow','How sending works');
 add(workflow,notice('After connecting Google, choose Merchants → Add merchant. The application sends a one-time account activation link from your connected Gmail. If Gmail is not connected or sending fails, the platform presents a private activation link instead. Gmail sending never changes payment status.'));
 return[sender,setup,workflow];
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