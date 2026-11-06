'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Activity,
  ArrowRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  Wallet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

const DEMO_ORDER_ID = 'DEMO-' + Date.now()

export default function DashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState({ volume: 0, successRate: 0, sessions: 0 })
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoStatus, setDemoStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [demoUrl, setDemoUrl] = useState('')

  useEffect(() => {
    // Fetch mock metrics from backend
    fetch('/api/v1/merchant/metrics')
      .then((r) => r.json())
      .then((data) => setMetrics({
        volume: data?.volume || 124580.50,
        successRate: data?.successRate || 98.7,
        sessions: data?.sessions || 142,
      }))
      .catch(() => setMetrics({ volume: 124580.50, successRate: 98.7, sessions: 142 }))

    // SSE connection for real-time updates
    const evtSource = new EventSource('/api/v1/merchant/events')
    evtSource.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data)
        if (update.type === 'metrics') {
          setMetrics(update.payload)
        }
      } catch {}
    }
    return () => evtSource.close()
  }, [])

  const createDemoPayment = async () => {
    setDemoLoading(true)
    setDemoStatus('pending')
    try {
      const res = await fetch('/api/v1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: DEMO_ORDER_ID,
          amount: '2.00',
          method: 'UPI',
        }),
      })
      const data = await res.json()
      if (res.ok && data.checkoutUrl) {
        setDemoUrl(data.checkoutUrl)
        setDemoStatus('success')
        toast.success('Demo payment link created', { description: 'Opening checkout...' })
        setTimeout(() => {
          window.open(data.checkoutUrl, '_blank')
        }, 800)
      } else {
        setDemoStatus('error')
        toast.error(data?.error || 'Failed to create payment')
      }
    } catch {
      setDemoStatus('error')
      toast.error('Network error creating payment')
    } finally {
      setDemoLoading(false)
    }
  }

  const metricCards = [
    {
      title: 'Total Volume',
      value: `₹${metrics.volume.toLocaleString()}`,
      change: '+12.4%',
      icon: CreditCard,
      color: 'text-indigo-400',
    },
    {
      title: 'Success Rate',
      value: `${metrics.successRate}%`,
      change: '+0.3%',
      icon: TrendingUp,
      color: 'text-emerald-400',
    },
    {
      title: 'Active Sessions',
      value: metrics.sessions.toLocaleString(),
      change: '+8%',
      icon: Activity,
      color: 'text-purple-400',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text tracking-tight">24<span className="text-indigo-300">.</span>7 Pay</span>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-4 text-sm">
                <span className="text-slate-400 font-medium">Merchant Account</span>
                <span className="text-indigo-300 font-semibold">Demo Store</span>
                <span className="w-px h-4 bg-white/10"></span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                  <span className="text-sm font-bold">DS</span>
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-white">Demo Merchant</p>
                  <p className="text-xs text-slate-400">demo@247pay.internal</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('token')
                    router.replace('/login')
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 text-sm">Welcome back. Here's how your business is performing today.</p>
          </div>
          <div className="flex gap-3">
            <button className="btn-ghost text-sm">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </button>
            <button className="btn-primary text-sm">
              <Plus className="w-4 h-4 mr-2" /> New Payment
            </button>
          </div>
        </div>

        {/* Quick Demo Mode Card - The "Money Shot" */}
        <section className="mb-8">
          <div className="glass-card p-6 md:p-8 relative overflow-hidden group">
            {/* Glow accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:translate-x-3/4 transition-transform duration-500" />
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                  <Zap className="w-5 h-5 text-indigo-400" />
                  ⚡ Quick Demo Mode
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Test the 24/7 Pay instant UPI flow in real-time. Create a ₹2 test payment and watch it confirm live.
                </p>
              </div>

              <button
                onClick={createDemoPayment}
                disabled={demoLoading || demoStatus === 'success'}
                className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white font-bold text-lg shadow-lg shadow-indigo-500/30 hover:from-indigo-600 hover:to-purple-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
              >
                {demoLoading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Creating…
                  </>
                ) : demoStatus === 'success' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Link Created — Open Checkout
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Create ₹2 Test Payment Link
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {demoStatus === 'error' && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-300 text-sm">
                <AlertCircle className="w-5 h-5" />
                <span>Failed to create demo payment. Please try again.</span>
              </div>
            )}
          </div>
        </section>

        {/* Standard Metric Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {metricCards.map((card) => (
            <div key={card.title} className="glass-card p-6 hover:border-white/20 transition-colors duration-300">
              <div className="flex items-center justify-between mb-4">
                <card.icon className="w-5 h-5 {card.color}" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{card.title}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{card.value}</span>
                <span className="text-emerald-400 text-sm font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {card.change} vs last week
                </span>
              </div>
              <div className="mt-6 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full" style={{ width: '78%' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <section className="mt-8">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Recent Activity</h3>
              <a href="#" className="text-sm text-indigo-400 hover:text-indigo-300">View all →</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 pb-3 text-slate-400">
                    <th className="font-medium">Order ID</th>
                    <th className="font-medium">Amount</th>
                    <th className="font-medium">Status</th>
                    <th className="font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[1, 2, 3].map((i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="py-4 text-white">ORD-2024{String(i).padStart(4, '0')}</td>
                      <td className="py-4 text-white">₹{((i + 1) * 499).toLocaleString()}</td>
                      <td className="py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Paid
                        </span>
                      </td>
                      <td className="py-4 text-slate-400">2m ago</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

// Plus icon inline since lucide may not export it
function Plus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
