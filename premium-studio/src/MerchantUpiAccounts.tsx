import{useCallback,useEffect,useState,type FormEvent}from'react';
import{motion,useReducedMotion}from'motion/react';
import{Bank,CheckCircle,WarningCircle,ShieldCheck,Plus,ArrowClockwise,LockKey,ArrowSquareOut,Info}from'@phosphor-icons/react';
import{Card,CardTitle}from'./components/ui/card';
import{Button}from'./components/ui/button';
import{addReceivingUpi,get,setReceivingUpiActive,setReceivingUpiType,type ReceivingAccount,type UpiAccountType}from'./api';

type Props={canManage:boolean;isPlatform:boolean;onAccountsChanged?:()=>void};
const VPA_FORMAT=/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,254}@[a-zA-Z0-9][a-zA-Z0-9.-]{1,63}$/;
export function MerchantUpiAccounts({canManage,isPlatform,onAccountsChanged}:Props){
 const[accounts,setAccounts]=useState<ReceivingAccount[]>([]);
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState('');
 const[success,setSuccess]=useState('');
 const[upiId,setUpiId]=useState('');
 const[payeeName,setPayeeName]=useState('');
 const[confirmOwnership,setConfirmOwnership]=useState(false);
 const[accountType,setAccountType]=useState<UpiAccountType>('MERCHANT');
 const[busy,setBusy]=useState('');
 const[reload,setReload]=useState(0);
 const reduced=useReducedMotion();
 const refresh=useCallback(()=>setReload(v=>v+1),[]);
 useEffect(()=>{
  if(isPlatform||!canManage){setLoading(false);return;}
  const controller=new AbortController();
  setLoading(true);
  get<{accounts:ReceivingAccount[]}>('/receiving-accounts',controller.signal)
   .then(result=>{if(!controller.signal.aborted)setAccounts(Array.isArray(result.accounts)?result.accounts:[])})
   .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Could not load receiving accounts')})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[isPlatform,canManage,reload]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!canManage||isPlatform||busy)return;
  const vpa=upiId.trim(),name=payeeName.trim();
  if(!VPA_FORMAT.test(vpa)||!name||name.length>150){setError('Enter a valid receiving UPI ID and the registered payee name (up to 150 characters).');return;}
  setBusy('create');setError('');setSuccess('');
  try{
   const result=await addReceivingUpi(vpa,name,confirmOwnership,accountType);
   setUpiId('');setPayeeName('');setConfirmOwnership(false);setAccountType('MERCHANT');
   setSuccess(result.account.isActive?'Receiving UPI account is ready for new payment links. Actual payment confirmation still requires bank/PSP evidence.':'Receiving UPI account saved. You can select it when you are ready to receive payments.');
   setAccounts(current=>[result.account,...current]);
   onAccountsChanged?.();refresh();
  }catch(err){setError(err instanceof Error?err.message:'Unable to add this UPI ID.');}
  finally{setBusy('');}
 }
 async function toggle(account:ReceivingAccount){
  if(busy||!canManage||isPlatform||account.isSlotBusy||account.currentActiveSessionId)return;
  const next=!account.isActive;
  if(next&&!window.confirm('Activate '+account.upiId+'? The backend allows only one active receiving UPI account per merchant and will deactivate the previous one. Existing payment sessions retain their own receiving account.'))return;
  setBusy(account.id);setError('');setSuccess('');
  try{
   await setReceivingUpiActive(account.id,next);
   setSuccess(next?'Receiving UPI account activated. Check your actual bank/PSP collection readiness before sharing links.':'Receiving UPI account deactivated.');
   refresh();onAccountsChanged?.();
  }catch(err){setError(err instanceof Error?err.message:'Unable to change UPI account status.');}
  finally{setBusy('');}
 }
 async function changeType(account:ReceivingAccount){
  if(busy||!canManage||isPlatform||account.isSlotBusy||account.currentActiveSessionId)return;
  const next:UpiAccountType=account.isMerchantEnabled?'PERSONAL':'MERCHANT';
  if(!window.confirm('Set '+account.upiId+' as '+next.toLowerCase()+' UPI? New checkout links will use the corresponding payment UI. Existing order destinations remain unchanged.'))return;
  setBusy(account.id);setError('');setSuccess('');
  try{
   await setReceivingUpiType(account.id,next);
   setSuccess('UPI account type changed to '+next.toLowerCase()+'. New checkout links use the updated payment flow.');
   refresh();onAccountsChanged?.();
  }catch(err){setError(err instanceof Error?err.message:'Unable to switch UPI account type.');}
  finally{setBusy('');}
 }
 if(isPlatform)return <Card><CardTitle>Merchant receiving accounts</CardTitle><p className="upi-empty-info">Platform administrators cannot attach personal UPI IDs to merchant accounts from this workspace. View your merchant network using the Merchants section.</p></Card>;
 if(!canManage)return <Card><CardTitle>Receiving UPI account access</CardTitle><p className="upi-empty-info"><LockKey size={19}/> Your assigned merchant role does not include <code>connections.manage</code>. A merchant OWNER or ADMIN can configure receiving UPI accounts. Payment creation separately requires <code>payments.create</code>; only an authorized owner/admin can change role permissions.</p></Card>;
 return <div className="merchant-upi-page">
  <motion.div initial={reduced?false:{opacity:0,y:9}} animate={{opacity:1,y:0}}>
   <Card className="merchant-upi-form-card"><div className="upi-section-heading"><div><span className="micro">MERCHANT SETTLEMENT DESTINATION</span><h2>Add receiving UPI ID<span className="heading-period">.</span></h2><p>Set up your business UPI ID once. The first receiving account is enabled automatically when you confirm ownership; changing an existing receiver remains an explicit action.</p></div><span className="link-studio-emblem"><Bank size={25} weight="duotone"/></span></div>
   <form className="upi-create-form" onSubmit={create}>
    <label className="payment-field"><span>Merchant receiving UPI ID</span><input className="payment-link-input" value={upiId} onChange={e=>setUpiId(e.target.value)} placeholder="yourbusiness@bank" autoComplete="off" maxLength={320} required aria-label="Merchant receiving UPI ID"/><small>Use the exact approved bank/PSP-issued VPA. A valid format is not proof that the VPA is active.</small></label>
    <label className="payment-field"><span>Registered payee name</span><input className="payment-link-input" value={payeeName} onChange={e=>setPayeeName(e.target.value)} placeholder="Business or account holder" autoComplete="organization" maxLength={150} required aria-label="Registered payee name"/></label>
    <fieldset className="payment-field" style={{display:'grid',gap:8}}>
     <legend>Receiving UPI account type</legend>
     <label className="upi-ownership-check"><input type="radio" name="upi-account-type" checked={accountType==='MERCHANT'} onChange={()=>setAccountType('MERCHANT')}/><span>Merchant VPA — show Google Pay, PhonePe and other app buttons</span></label>
     <label className="upi-ownership-check"><input type="radio" name="upi-account-type" checked={accountType==='PERSONAL'} onChange={()=>setAccountType('PERSONAL')}/><span>Personal VPA — show a QR that opens a UPI app when tapped on the phone</span></label>
    </fieldset>
    <label className="upi-ownership-check"><input type="checkbox" checked={confirmOwnership} onChange={e=>setConfirmOwnership(e.target.checked)} required/><span>I confirm this UPI ID belongs to my business and the payee name is correct. This acknowledgement does not verify bank ownership.</span></label><Button className="apple-action-button" disabled={Boolean(busy)||!confirmOwnership||!VPA_FORMAT.test(upiId.trim())||!payeeName.trim()} type="submit"><Plus size={18}/>{busy==='create'?'Saving…':'Add UPI account'}</Button>
   </form>
   {error&&<div role="alert" className="payment-form-error"><WarningCircle size={18}/>{error}</div>}
   {success&&<div role="status" className="upi-success"><CheckCircle size={18}/>{success}</div>}
  </Card>
  </motion.div>
  <Card><div className="section-head"><div><span className="micro">RECEIVING ACCOUNTS</span><CardTitle>Your saved UPI IDs</CardTitle></div><Button variant="outline" onClick={refresh} disabled={loading||Boolean(busy)}><ArrowClockwise size={16}/>Refresh</Button></div>
   {loading?<p className="upi-empty-info" role="status">Loading merchant receiving accounts…</p>:accounts.length===0?<p className="upi-empty-info">No receiving UPI IDs have been configured yet. Add a business UPI ID above.</p>:
    <div className="upi-account-list">{accounts.map(account=><div className="upi-account-row" key={account.id}><div className="upi-account-avatar"><Bank size={22}/></div><div className="upi-account-details"><strong>{account.upiId}</strong><span>{account.payeeName} · {account.isMerchantEnabled?'Merchant app buttons':'Personal tappable QR'} · {account.isActive?'Active for new checkouts':'Inactive'}</span><small>{account.isSlotBusy?'In use by checkout · ':''}{account.dailyTxnCount??0} recorded daily transactions · {account.bankDetails?.bankName||'Bank verification not shown'}</small></div><div className="upi-account-control"><span className={'status '+(account.isActive?'good':'pending')}>{account.isActive?'ACTIVE':'INACTIVE'}</span><Button variant="outline" disabled={Boolean(busy)||Boolean(account.isSlotBusy)||Boolean(account.currentActiveSessionId)} onClick={()=>void changeType(account)}>{busy===account.id?'Updating…':account.isMerchantEnabled?'Set Personal':'Set Merchant'}</Button><Button variant="outline" disabled={Boolean(busy)||Boolean(account.isSlotBusy)||Boolean(account.currentActiveSessionId)} onClick={()=>void toggle(account)}>{busy===account.id?'Updating…':account.isActive?'Deactivate':'Activate'}</Button></div></div>)}</div>}
   <div className="upi-diagnostic-note"><Info size={20}/><div><strong>VPA health and UPI intent diagnostics</strong><p>Format checks cannot confirm an account is live. Verified success rates require at least 20 unique authoritative finalized payment records for that VPA; until then, health is <b>Unknown</b>. Checkout preflight validates exact receiver, INR amount and reference before reporting any diagnostic outcome. Bank/PSP credit verification remains authoritative.</p></div></div>
  </Card>
  <Card className="upi-safety-card"><ShieldCheck size={24} weight="duotone"/><div><CardTitle>One active receiving VPA per merchant</CardTitle><p>Your backend enforces this rule. Switching the active receiving account affects new payment sessions only. Customer return, UTR entry or a syntactically correct intent never confirms payment.</p></div></Card>
 </div>;
}
