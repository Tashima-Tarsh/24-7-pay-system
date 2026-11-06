'use client'

import { useState } from 'react'
import { Mail, Lock, Zap, ShieldCheck, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = '/dashboard'
      } else {
        alert('Invalid credentials')
      }
    } catch {
      alert('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950">
      {/* Background mesh blobs */}
      <div className="mesh-blob top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/20"></div>
      <div className="mesh-blob bottom-[-10%] right-[-10%] w-[700px] h-[700px] bg-purple-600/15 animation-delay-2000"></div>
      <div className="mesh-blob top-[40%] left-[50%] w-[500px] h-[500px] bg-indigo-500/10 animation-delay-4000"></div>

      {/* Subtle grid pattern */}
      <div className="relative z-0 inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-10 pointer-events-none" />

      <div className="relative z-10 flex h-screen w-full items-center justify-center px-4">
        {/* Left: Glass login card */}
        <div className="hidden lg:flex lg:w-1/2 h-full items-center justify-center p-8">
          <div className="glass-card w-full max-w-md p-8 animate-scale-in">
            <div className="flex items-center gap-2 mb-8">
              <Zap className="w-6 h-6 text-white" />
              <h1 className="text-2xl font-bold gradient-text tracking-tight">24<span className="text-indigo-300">.</span>7 Pay</h1>
            </div>

            <p className="text-slate-400 text-sm mb-8">
              Sign in to your merchant dashboard. Instant UPI collections, real-time reconciliation.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative group">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                <input
                  type="email"
                  id="email"
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input pl-11 text-white placeholder-transparent"
                  placeholder="Email address"
                />
                <label htmlFor="email" className="absolute left-3 top-3 -translate-y-1/2 text-xs font-medium text-slate-400 transition-all duration-200 group-focus-within:-translate-y-6 group-focus-within:text-indigo-400 group-focus-within:text-xs">
                  Email address
                </label>
              </div>

              <div className="relative group">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                <input
                  type="password"
                  id="password"
                  placeholder=" "
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input pl-11 text-white placeholder-transparent"
                  placeholder="Password"
                />
                <label htmlFor="password" className="absolute left-3 top-3 -translate-y-1/2 text-xs font-medium text-slate-400 transition-all duration-200 group-focus-within:-translate-y-6 group-focus-within:text-indigo-400 group-focus-within:text-xs">
                  Password
                </label>
              </div>

              <button type="button" className="btn-ghost flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4" />
                Sign in with Passkey
              </button>

              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <span>Sign In to Dashboard</span>
                )}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-500">Don't have an account?</span>
              <a href="#" className="text-indigo-400 hover:text-indigo-300 font-medium">Create account</a>
            </div>

            <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                Secured by 24/7 Pay Infrastructure
              </span>
            </div>
          </div>
        </div>

        {/* Right: Animated gradient mesh / financial graphic */}
        <div className="flex lg:w-1/2 h-full items-center justify-center p-8 overflow-hidden">
          <div className="relative w-full max-w-lg h-[600px]">
            {/* Abstract financial graph lines */}
            <svg className="w-full h-full opacity-20" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="graphGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <path d="M50,550 L150,400 L250,520 L350,380 L450,480 L550,320 L650,450 L750,280" stroke="url(#graphGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="50" cy="550" r="4" fill="#6366f1" />
              <circle cx="150" cy="400" r="4" fill="#a855f7" />
              <circle cx="250" cy="520" r="4" fill="#6366f1" />
              <circle cx="350" cy="380" r="4" fill="#a855f7" />
              <circle cx="450" cy="480" r="4" fill="#6366f1" />
              <circle cx="550" cy="320" r="4" fill="#a855f7" />
              <circle cx="650" cy="450" r="4" fill="#6366f1" />
              <circle cx="750" cy="280" r="4" fill="#a855f7" />
            </svg>

            {/* Floating data cards */}
            <div className="absolute top-1/4 left-1/4 glass-card p-4 rounded-2xl transform -translate-x-1/2 -translate-y-1/2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-300 font-medium">₹2.4M</span>
              </div>
              <span className="text-[10px] text-slate-500">Volume today</span>
            </div>
            <div className="absolute bottom-1/4 right-1/4 glass-card p-4 rounded-2xl transform translate-x-1/2 translate-y-1/2 animate-fade-in" style={{ animationDelay: '0.6s' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                <span className="text-xs text-indigo-300 font-medium">99.4%</span>
              </div>
              <span className="text-[10px] text-slate-500">Success rate</span>
            </div>
            <div className="absolute top-1/3 right-1/5 glass-card p-3 rounded-xl transform translate-x-1/2 -translate-y-1/3 animate-fade-in" style={{ animationDelay: '1s' }}>
              <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">live sessions</span>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1 h-4 bg-indigo-500 rounded" />
                <div className="w-1 h-6 bg-purple-500 rounded" />
                <div className="w-1 h-3 bg-indigo-500 rounded" />
                <div className="w-1 h-8 bg-purple-500 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
