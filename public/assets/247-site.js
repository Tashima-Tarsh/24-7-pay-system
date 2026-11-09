const menu=document.getElementById('mobile-menu');
const nav=document.getElementById('primary-nav');
if(menu&&nav){
  function close(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
  nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
}
const year=document.getElementById('year');if(year)year.textContent=String(new Date().getFullYear());
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const revealEls=document.querySelectorAll('[data-reveal]');
if('IntersectionObserver' in window&&!motion.matches){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}
  }),{rootMargin:'0px 0px -45px 0px',threshold:.08});
  revealEls.forEach(el=>observer.observe(el));
}else revealEls.forEach(el=>el.classList.add('visible'));
const journey=[
  {symbol:'◇',kick:'STEP 01 — CREATE',title:'A payment starts with a clear request.',body:'Your business creates an order. The amount and recipient are set before a customer gets their checkout link.'},
  {symbol:'▦',kick:'STEP 02 — PAY',title:'Let customers pay their way.',body:'They see where the money is going, check the amount, then scan a QR or open a compatible UPI app.'},
  {symbol:'◎',kick:'STEP 03 — CHECK',title:'Know what is happening, not what someone clicked.',body:'The status stays honest while a trusted source confirms the transfer. A customer report alone does not complete the order.'},
  {symbol:'✓',kick:'STEP 04 — CONFIRM',title:'One clear outcome for your business.',body:'Once the configured confirmation checks are met, the updated status can reach your application through a signed event.'}
];
const jButtons=[...document.querySelectorAll('.journey-tab')];
function showStep(index,focus=false){
  if(!Number.isInteger(index)||index<0||index>=journey.length)return;
  const step=journey[index];
  document.getElementById('journey-kicker').textContent=step.kick;
  document.getElementById('journey-title').textContent=step.title;
  document.getElementById('journey-body').textContent=step.body;
  document.getElementById('journey-graphic').replaceChildren(Object.assign(document.createElement('div'),{className:'journey-symbol',textContent:step.symbol}));
  document.getElementById('journey-progress').style.width=String((index+1)*25)+'%';
  jButtons.forEach((button,i)=>{button.classList.toggle('selected',i===index);button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
  if(focus)jButtons[index].focus();
}
jButtons.forEach((button,i)=>{button.addEventListener('click',()=>showStep(i));button.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();showStep((i+1)%journey.length,true);}if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();showStep((i+journey.length-1)%journey.length,true);}});});
if(jButtons.length)showStep(0);
if(!motion.matches&&!navigator.connection?.saveData)import('/assets/247-scene.js').catch(()=>{});
