import {useState,type FormEvent} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowRight,LockKey,ShieldCheck,SpinnerGap} from '@phosphor-icons/react';
import {signIn,registerMerchantAccount} from './api';
import {Button} from './components/ui/button';

export function PremiumSignIn({onSuccess}:{onSuccess:()=>void}){
 const[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const[registering,setRegistering]=useState(false);
 const[businessName,setBusinessName]=useState(''),[contactName,setContactName]=useState(''),[mobile,setMobile]=useState('');
 const[error,setError]=useState(''),[working,setWorking]=useState(false);
 const reduce=useReducedMotion();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(working)return;setError('');setWorking(true);
  try{if(registering)await registerMerchantAccount({businessName:businessName.trim(),contactName:contactName.trim(),mobile:mobile.trim(),email:email.trim(),password});await signIn(email.trim(),password);setPassword('');onSuccess();}
  catch(err){setError(err instanceof Error?err.message:'Unable to sign in.');}
  finally{setWorking(false);}
 }
 return <main className="premium-auth">
  <div className="auth-cinematic-side"><a href="/" className="cinematic-auth-brand"><span className="auth-brand-symbol">24</span><span>24/7 PAY <small>THE PAYMENT PLATFORM</small></span></a>
   <motion.div className="auth-editorial" initial={reduce?false:{opacity:0,y:26}} animate={{opacity:1,y:0}} transition={{duration:.65}}>
    <div className="cinematic-overline"><span className="overline-dot"/>CURRENCY, CLARITY, CONTROL</div>
    <h1>Every payment.<br/>A better <em>perspective.</em></h1>
    <p>Your business deserves software that feels as confident as the infrastructure behind it.</p>
    <div className="auth-ambient-board" aria-hidden="true"><span className="ambient-ring ring-one"/><span className="ambient-ring ring-two"/><span className="ambient-core">24<small>/7</small></span></div>
   </motion.div>
   <div className="auth-dark-footer">DESIGNED FOR PEOPLE WHO MOVE MONEY. <span>EST. 2026</span></div>
  </div>
  <section className="auth-right-panel" aria-labelledby="auth-login-title"><div className="auth-right-inner">
   <div className="auth-login-eyebrow"><LockKey size={15} weight="duotone"/>SECURE SAAS WORKSPACE</div>
   <h2 id="auth-login-title">{registering?'Start your business.':'Welcome back'}<span>.</span></h2>
   <p className="auth-login-lead">Sign in to your 24/7 Pay account. Your workspace adapts to your merchant or administrator role.</p>
   <div className="auth-mode-tabs" role="group" aria-label="Account access"><button type="button" aria-pressed={!registering} className={!registering?'selected':''} onClick={()=>{setRegistering(false);setError('')}}>Sign in</button><button type="button" aria-pressed={registering} className={registering?'selected':''} onClick={()=>{setRegistering(true);setError('')}}>Create merchant account</button></div>
   <form onSubmit={submit} className="premium-login-form">
   {registering&&<><label><span>Business name</span><input required maxLength={250} value={businessName} onChange={e=>setBusinessName(e.target.value)} autoComplete="organization" placeholder="Your business"/></label><label><span>Contact name</span><input required maxLength={250} value={contactName} onChange={e=>setContactName(e.target.value)} autoComplete="name" placeholder="Your name"/></label><label><span>Mobile number</span><input required type="tel" pattern="\\+?[0-9]{10,15}" value={mobile} onChange={e=>setMobile(e.target.value)} autoComplete="tel" placeholder="10–15 digits"/></label></>}
   <label><span>Work email</span><input required type="email" autoComplete="username" name="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@business.com"/></label><label><span>Password</span><input required type="password" autoComplete="current-password" name="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={registering?"At least 12 characters":"Your password"} minLength={registering?12:undefined}/></label>
   {error&&<div className="payment-form-error" role="alert">{error}</div>}
   <Button type="submit" className="apple-action-button auth-submit" disabled={working}>{working?<SpinnerGap className="spin" size={19}/>:null}{working?(registering?'Creating account…':'Signing in…'):(registering?'Create account and enter workspace':'Enter workspace')}<ArrowRight size={19}/></Button></form>
   <p className="auth-privacy-note"><ShieldCheck size={17} weight="duotone"/>Secured by your existing 24/7 Pay authentication system.</p>
   <div className="auth-help"><span>One secure sign-in for merchants and administrators. Registration does not bypass receiving-account verification or payment confirmation.</span></div>
  </div></section>
 </main>;
}
