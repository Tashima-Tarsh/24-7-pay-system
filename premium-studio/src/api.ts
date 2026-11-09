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
export function money(paise:string|number|undefined){const n=Number(paise||0)/100;return Number.isFinite(n)?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n):'—';}
export function number(n:number|undefined){return new Intl.NumberFormat('en-IN').format(n||0);}
export function date(raw?:string){if(!raw)return'—';const d=new Date(raw);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}
