import {useState,type FormEvent} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowRight,LockKey,ShieldCheck,SpinnerGap} from '@phosphor-icons/react';
import {signIn} from './api';
import {Button} from './components/ui/button';

export function PremiumSignIn({onSuccess}:{onSuccess:()=>void}){
 const[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const[error,setError]=useState(''),[working,setWorking]=useState(false);
 const reduce=useReducedMotion();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(working)return;setError('');setWorking(true);
  try{await signIn(email.trim(),password);setPassword('');onSuccess();}
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
   <div className="auth-login-eyebrow"><LockKey size={15} weight="duotone"/>PRIVATE MERCHANT WORKSPACE</div>
   <h2 id="auth-login-title">Welcome back<span>.</span></h2>
   <p className="auth-login-lead">Sign in to create real UPI payment links and manage your payment operations.</p>
   <form onSubmit={submit} className="premium-login-form"><label><span>Work email</span><input required type="email" autoComplete="username" name="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@business.com"/></label><label><span>Password</span><input required type="password" autoComplete="current-password" name="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
   {error&&<div className="payment-form-error" role="alert">{error}</div>}
   <Button type="submit" className="apple-action-button auth-submit" disabled={working}>{working?<SpinnerGap className="spin" size={19}/>:null}{working?'Signing in…':'Enter workspace'}<ArrowRight size={19}/></Button></form>
   <p className="auth-privacy-note"><ShieldCheck size={17} weight="duotone"/>Secured by your existing 24/7 Pay authentication system.</p>
   <div className="auth-help"><span>Need an invitation?</span><a href="/platform">Open the classic portal</a></div>
  </div></section>
 </main>;
}
