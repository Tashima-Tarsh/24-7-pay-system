import {useEffect,useState,type FormEvent} from 'react';
import {Buildings,UsersThree,ArrowClockwise,Plus,ShieldCheck,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {Card,CardTitle} from './components/ui/card';
import {Button} from './components/ui/button';
import {get,adminCreateMerchant,type PlatformMerchant,type StaffUser} from './api';
type Props={view:'admin'|'merchants'|'team';canReadMerchants:boolean;canCreateMerchants:boolean;canReadStaff:boolean};
export function AdminConsole({view,canReadMerchants,canCreateMerchants,canReadStaff}:Props){
 const[merchants,setMerchants]=useState<PlatformMerchant[]>([]);
 const[total,setTotal]=useState(0);
 const[staff,setStaff]=useState<StaffUser[]>([]);
 const[query,setQuery]=useState('');
 const[loading,setLoading]=useState(false);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[success,setSuccess]=useState('');
 const[refresh,setRefresh]=useState(0);
 const[showCreate,setShowCreate]=useState(false);
 const[fields,setFields]=useState({businessName:'',contactName:'',mobile:'',email:''});
 useEffect(()=>{
  const ctl=new AbortController();setLoading(true);setError('');
  const jobs:Promise<unknown>[]=[];
  if(canReadMerchants)jobs.push(get<{merchants:PlatformMerchant[];total:number}>('/merchants?limit=100',ctl.signal).then(r=>{if(!ctl.signal.aborted){setMerchants(r.merchants||[]);setTotal(r.total||0);}}));
  if(canReadStaff)jobs.push(get<{users:StaffUser[]}>('/staff',ctl.signal).then(r=>{if(!ctl.signal.aborted)setStaff(r.users||[]);}));
  Promise.allSettled(jobs).then(r=>{if(!ctl.signal.aborted){const failure=r.filter(x=>x.status==='rejected');if(failure.length)setError('Some administration records could not load. Check your account permissions.');setLoading(false);}});
  return()=>ctl.abort();
 },[canReadMerchants,canReadStaff,refresh]);
 async function createMerchant(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!canCreateMerchants||busy)return;
  setBusy(true);setError('');setSuccess('');
  try{
   const result=await adminCreateMerchant(fields);
   setSuccess('Merchant created: '+result.businessName+'. '+(result.invitationSent?'Invitation sent to the owner.':'Check the invitation delivery status in administration.'));
   setShowCreate(false);setFields({businessName:'',contactName:'',mobile:'',email:''});setRefresh(v=>v+1);
  }catch(err){setError(err instanceof Error?err.message:'Merchant creation failed.');}
  finally{setBusy(false);}
 }
 const filtered=merchants.filter(m=>[m.profile?.businessName,m.profile?.contactName,m.merchant_id,m.status].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase())));
 const filteredStaff=staff.filter(m=>[m.email,m.role].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase())));
 return <div className="saas-admin">
  <div className="admin-intro"><div><span className="micro">ONE PLATFORM · ROLE-BASED ACCESS</span><h2>{view==='team'?'Your team. One command centre.':view==='merchants'?'Your merchants. In one place.':'The business behind every payment.'}</h2><p>Manage merchant accounts and platform staff from the same workspace. No merchant payment data is changed here.</p></div><Button variant="outline" onClick={()=>setRefresh(v=>v+1)} disabled={loading||busy}><ArrowClockwise size={17}/>Refresh</Button></div>
  {error&&<div role="alert" className="payment-form-error"><WarningCircle size={17}/>{error}</div>}
  {success&&<div role="status" className="upi-success"><CheckCircle size={17}/>{success}</div>}
  {view==='admin'&&<div className="saas-kpis"><Card><span className="micro">REGISTERED MERCHANTS</span><strong>{total.toLocaleString('en-IN')}</strong><small>Platform merchant directory</small></Card><Card><span className="micro">VISIBLE STAFF</span><strong>{staff.length.toLocaleString('en-IN')}</strong><small>Authorized platform team</small></Card><Card><span className="micro">WORKSPACE MODEL</span><strong>One</strong><small>Shared sign-in, distinct roles</small></Card></div>}
  {view!=='team'&&<Card><div className="section-head"><div><span className="micro">MERCHANT DIRECTORY</span><CardTitle>Merchant accounts</CardTitle></div>{canCreateMerchants&&<Button onClick={()=>setShowCreate(x=>!x)}><Plus size={17}/>{showCreate?'Close form':'New merchant'}</Button>}</div>
   {showCreate&&canCreateMerchants&&<form className="saas-merchant-form" onSubmit={createMerchant}>
    <label>Business name<input required maxLength={250} value={fields.businessName} onChange={e=>setFields(v=>({...v,businessName:e.target.value}))}/></label>
    <label>Contact name<input required maxLength={250} value={fields.contactName} onChange={e=>setFields(v=>({...v,contactName:e.target.value}))}/></label>
    <label>Mobile<input required pattern="\\+?[0-9]{10,15}" value={fields.mobile} onChange={e=>setFields(v=>({...v,mobile:e.target.value}))}/></label>
    <label>Owner email<input required type="email" value={fields.email} onChange={e=>setFields(v=>({...v,email:e.target.value}))}/></label>
    <div className="saas-form-foot"><span>An owner invitation is sent through the existing backend.</span><Button disabled={busy}>{busy?'Creating…':'Create merchant'}</Button></div>
   </form>}
   {canReadMerchants?<><label className="saas-search">Search merchants<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search business or ID"/></label><div className="table-scroll" role="region" aria-label="Merchant accounts" tabIndex={0}><table><thead><tr><th>Business</th><th>Contact</th><th>Status</th><th>Merchant ID</th></tr></thead><tbody>{filtered.map(m=><tr key={m.merchant_id}><td><strong>{m.profile?.businessName||'Merchant'}</strong></td><td>{m.profile?.contactName||'—'}</td><td><span className={'status '+(m.status==='ACTIVE'?'good':'pending')}>{m.status}</span></td><td className="monospace">{m.merchant_id}</td></tr>)}{!loading&&!filtered.length&&<tr><td colSpan={4}>No matching merchant accounts.</td></tr>}</tbody></table></div><p className="fineprint">Showing {filtered.length} of up to 100 loaded records; total {total}. Merchant payment collection is managed by each merchant's own account.</p></>:<p>Merchant directory access is not assigned to this role.</p>}
  </Card>}
  {(view==='team'||view==='admin')&&<Card><div className="section-head"><div><span className="micro">ACCESS AND OPERATIONS</span><CardTitle>Platform staff</CardTitle></div><UsersThree size={21} weight="duotone"/></div>{canReadStaff?<div className="table-scroll"><table><thead><tr><th>Email</th><th>Role</th><th>Account status</th></tr></thead><tbody>{filteredStaff.map(u=><tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td><span className={'status '+(u.active?'good':'pending')}>{u.active?'ACTIVE':'DISABLED'}</span></td></tr>)}{!loading&&!filteredStaff.length&&<tr><td colSpan={3}>No staff records to show.</td></tr>}</tbody></table></div>:<p>Staff administration is available to authorized platform administrators.</p>}</Card>}
  <Card className="saas-admin-note"><ShieldCheck size={23}/><div><CardTitle>Security roles remain separate</CardTitle><p>A platform operator manages the SaaS; a merchant owner or team member operates that merchant's payments. Both use this same interface, but neither role can bypass backend authorization or financial state checks.</p></div></Card>
 </div>;
}
