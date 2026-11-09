import {useEffect,useState} from 'react';
import {Bank,ShieldCheck,Key,ArrowClockwise,WarningCircle,CheckCircle} from '@phosphor-icons/react';
import {Card,CardTitle} from './components/ui/card';
import {Button} from './components/ui/button';
import {get,money,date} from './api';

type Balance={currency:string;accounts:{code:string;balancePaise:string}[]};
type ApiKeys={keys:{id:string;label:string;prefix:string;environment:string;revokedAt?:string|null;lastUsedAt?:string|null;scopes:string[]}[]};
type ApiUsage={requests:{id:string;method:string;path:string;status:number;duration_ms:number;created_at:string}[]};
type Connection={id:string;provider:string;environment:string;status:string;enabled:boolean;approved:boolean};
type Rule={id:string;ruleType:string;targetType:string;target:string;active:boolean;reason:string};
type Props={area:'finance'|'integrations'|'controls';permissions:string[]};
export function MerchantOperations({area,permissions}:Props){
 const has=(p:string)=>permissions.includes('*')||permissions.includes(p);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [balance,setBalance]=useState<Balance|null>(null),[keys,setKeys]=useState<ApiKeys|null>(null);
 const [usage,setUsage]=useState<ApiUsage|null>(null),[connections,setConnections]=useState<Connection[]>([]),[rules,setRules]=useState<Rule[]>([]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  const jobs:Promise<unknown>[]=[];
  if(area==='finance'&&has('reports.read'))jobs.push(get<Balance>('/balance',controller.signal).then(setBalance));
  if(area==='integrations'){
   if(has('credentials.manage'))jobs.push(get<ApiKeys>('/api-keys',controller.signal).then(setKeys),get<ApiUsage>('/api-usage',controller.signal).then(setUsage));
   if(has('connections.manage'))jobs.push(get<{connections:Connection[]}>('/connections',controller.signal).then(r=>setConnections(r.connections||[])));
  }
  if(area==='controls'&&has('policy.manage'))jobs.push(get<{rules:Rule[]}>('/rules',controller.signal).then(r=>setRules(r.rules||[])));
  if(!jobs.length){setLoading(false);return()=>controller.abort();}
  Promise.allSettled(jobs).then(results=>{if(controller.signal.aborted)return;
   if(results.some(x=>x.status==='rejected'))setError('Some records could not be retrieved. Check your account permissions or connection.');
   setLoading(false);
  });
  return()=>controller.abort();
 },[area,revision,permissions.join('|')]);
 const heading=area==='finance'?'Financial ledger':area==='integrations'?'API & provider operations':'Risk & payment controls';
 const permitted=area==='finance'?has('reports.read'):area==='integrations'?has('credentials.manage')||has('connections.manage'):has('policy.manage');
 return <section className="operations-workspace" aria-label={heading}>
  <div className="operations-heading"><div><span className="micro">LIVE BACKEND DATA · MERCHANT-SCOPED</span><h2>{heading}</h2><p>{area==='finance'?'Account balances are internal ledger records, not independently verified bank balances.':area==='integrations'?'Inspect active integrations without exposing private API secrets.':'Review your configured payment rules; no automatic clearing of quarantined evidence.'}</p></div>
   <Button variant="outline" onClick={()=>setRevision(n=>n+1)} disabled={loading}><ArrowClockwise size={17}/>Refresh</Button></div>
  {!permitted?<Card><CardTitle>Restricted by role</CardTitle><p>Your merchant account needs the corresponding read permission to access these records.</p></Card>:null}
  {error&&<p className="operations-error" role="alert"><WarningCircle size={18}/>{error}</p>}
  {loading?<Card><p role="status">Loading live account records…</p></Card>:null}
  {!loading&&permitted&&area==='finance'&&<div className="operations-grid">
   <Card className="operations-feature"><Bank size={25} weight="duotone"/><span className="micro">INTERNAL ACCOUNTING</span><CardTitle>Double-entry ledger</CardTitle><p>Balances reflect the ledger engine. They are not bank settlement proof.</p><strong>{balance?.accounts?.length??0} accounts</strong></Card>
   <Card className="operations-wide"><CardTitle>Account balances</CardTitle><div className="table-scroll" role="region" aria-label="Internal ledger balances" tabIndex={0}><table><thead><tr><th scope="col">Account</th><th scope="col">Balance</th></tr></thead><tbody>{(balance?.accounts||[]).map(a=><tr key={a.code}><td>{a.code.replaceAll('_',' ')}</td><td className="monospace">{money(a.balancePaise)}</td></tr>)}{!balance?.accounts?.length&&<tr><td colSpan={2}>No ledger accounts available.</td></tr>}</tbody></table></div></Card>
  </div>}
  {!loading&&permitted&&area==='integrations'&&<div className="operations-grid">
   {has('credentials.manage')&&<Card className="operations-wide"><span className="micro">MERCHANT CREDENTIALS</span><CardTitle>API key inventory</CardTitle><p>Only key prefixes and metadata are displayed. Private secrets are never returned here.</p><div className="table-scroll" role="region" aria-label="API key inventory" tabIndex={0}><table><thead><tr><th>Key</th><th>Environment</th><th>Status</th><th>Last used</th></tr></thead><tbody>{(keys?.keys||[]).map(k=><tr key={k.id}><td><Key size={16} weight="duotone"/> {k.label} <span className="monospace">({k.prefix}…)</span></td><td>{k.environment}</td><td>{k.revokedAt?'Revoked':'Active'}</td><td>{date(k.lastUsedAt||undefined)}</td></tr>)}{!keys?.keys?.length&&<tr><td colSpan={4}>No API keys configured.</td></tr>}</tbody></table></div></Card>}
   {has('connections.manage')&&<Card className="operations-wide"><span className="micro">PAYMENT RAILS</span><CardTitle>Provider connections</CardTitle><div className="table-scroll" role="region" aria-label="Provider connections" tabIndex={0}><table><thead><tr><th>Provider</th><th>Environment</th><th>State</th><th>Approval</th></tr></thead><tbody>{connections.map(c=><tr key={c.id}><td>{c.provider}</td><td>{c.environment}</td><td>{c.enabled?'Enabled':'Disabled'}</td><td>{c.approved?'Approved':'Not approved'}</td></tr>)}{!connections.length&&<tr><td colSpan={4}>No provider connections are configured. Direct UPI receiving accounts are managed separately.</td></tr>}</tbody></table></div></Card>}
   {has('credentials.manage')&&<Card className="operations-wide"><span className="micro">REQUEST OBSERVABILITY</span><CardTitle>Recent API requests</CardTitle><div className="table-scroll" role="region" aria-label="API request history" tabIndex={0}><table><thead><tr><th>Method</th><th>Route</th><th>HTTP</th><th>Latency</th><th>Time</th></tr></thead><tbody>{(usage?.requests||[]).slice(0,30).map(r=><tr key={r.id}><td>{r.method}</td><td className="monospace">{r.path}</td><td>{r.status}</td><td>{r.duration_ms} ms</td><td>{date(r.created_at)}</td></tr>)}{!usage?.requests?.length&&<tr><td colSpan={5}>No instrumented merchant API calls yet.</td></tr>}</tbody></table></div></Card>}
  </div>}
  {!loading&&permitted&&area==='controls'&&<div className="operations-grid"><Card className="operations-feature"><ShieldCheck size={25} weight="duotone"/><span className="micro">POLICY ENGINE</span><CardTitle>Configured controls</CardTitle><strong>{rules.length} rules</strong><p>Read-only view of merchant and platform rules; bank confirmation remains authoritative.</p></Card><Card className="operations-wide"><CardTitle>Rules inventory</CardTitle><div className="table-scroll" role="region" aria-label="Policy rules" tabIndex={0}><table><thead><tr><th>Policy</th><th>Target type</th><th>Target</th><th>Status</th><th>Reason</th></tr></thead><tbody>{rules.map(r=><tr key={r.id}><td>{r.ruleType}</td><td>{r.targetType}</td><td className="monospace">{r.target}</td><td>{r.active?<><CheckCircle size={15}/> Active</>:'Inactive'}</td><td>{r.reason}</td></tr>)}{!rules.length&&<tr><td colSpan={5}>No configured payment rules found.</td></tr>}</tbody></table></div></Card></div>}
 </section>;
}
