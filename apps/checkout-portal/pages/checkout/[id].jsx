'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Lock,
  RefreshCw,
  CheckCircle2,
  Phone,
  Smartphone,
  QrCode,
  AlertCircle,
} from 'lucide-react'

export default function CheckoutPage({ query }) {
  const router = useRouter()
  const paymentId = query.id
  const [status, setStatus] = useState<'waiting' | 'success' | 'error' | 'loading'>('loading')
  const [amount, setAmount] = useState('2.00')
  const [utr, setUtr] = useState('')
  const [upiUri, setUpiUri] = useState('')
  const [confetti, setConfetti] = useState<number>(0)
  const [sseReady, setSseReady] = useState(false)

  // Fetch payment state from backend
  const fetchPayment = useCallback(async () => {
    if (!paymentId) return
    try {
      const res = await fetch(`/api/v1/checkout/${encodeURIComponent(paymentId)}/state`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error('Payment not found')
      const data = await res.json()
      setAmount(data?.amount || '2.00')
      setUpiUri(data?.upiUri || '')
      if (data?.status === 'SUCCESS' || data?.status === 'VERIFIED') {
        setStatus('success')
        setUtr(data?.utr || data?.bankReferenceNumber || 'UNKNOWN')
        setConfetti(Date.now())
      } else if (data?.status === 'FAILED' || data?.status === 'EXPIRED') {
        setStatus('error')
      } else {
        setStatus('waiting')
      }
    } catch {
      setStatus('waiting')
    }
  }, [paymentId])

  useEffect(() => {
    fetchPayment()
  }, [fetchPayment])

  // SSE for real-time status updates
  useEffect(() => {
    if (!paymentId) return
    const evtSource = new EventSource(`/api/v1/checkout/${encodeURIComponent(paymentId)}/stream`)
    evtSource.onopen = () => setSseReady(true)
    evtSource.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data)
        if (update.type === 'payment_status' || update.type === 'status') {
          const newStatus = update.payload?.status || update.status
          if (newStatus === 'SUCCESS' || newStatus === 'VERIFIED' || newStatus === 'paid') {
            setStatus('success')
            setUtr(update.payload?.utr || update.payload?.bankReferenceNumber || 'UNKNOWN')
            setConfetti(Date.now())
          } else if (newStatus === 'FAILED' || newStatus === 'EXPIRED') {
            setStatus('error')
          } else {
            setStatus('waiting')
          }
        }
      } catch {}
    }
    evtSource.onerror = () => {
      // SSE failed — fall back to polling
      evtSource.close()
      const timer = setInterval(fetchPayment, 3000)
      return () => clearInterval(timer)
    }
    return () => evtSource.close()
  }, [paymentId, fetchPayment, sseReady])

  const launchUpiIntent = () => {
    if (!upiUri) {
      toastError('UPI intent not available yet')
      return
    }
    // Trigger UPI deep link intent
    window.location.href = upiUri
  }

  const openCheckoutInNewTab = () => {
    if (!paymentId) return
    window.open(`/checkout/${paymentId}`, '_blank')
  }

  const renderConfetti = () => {
    if (!confetti) return null
    const colors = [220, 280, 320, 340, 30, 60, 180] // indigo/purple/emerald hues
    const pieces = Array.from({ length: 40 }, (_, i) => {
      const h = colors[Math.floor(Math.random() * colors.length)]
      const duration = 0.5 + Math.random() * 1.0
      const left = Math.random() * 100
      const delay = Math.random() * 0.3
      return (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${left}%`,
            top: '-10px',
            '--h': h,
            '--duration': `${duration}s`,
            animationDelay: `${delay}s`,
          }}
        />
      )
    })
    return <div className="pointer-events-none w-full h-full top-0 left-0 z-50">{pieces}</div>
  }

  return (
    <div className="min-h-screen w-full overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      {/* Background mesh */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="relative z-0 inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-10" />
      </div>

      <div className="relative z-10 flex flex-col h-screen w-full max-w-md mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center gap-2 mb-10">
          <Lock className="w-5 h-5 text-white/80" />
          <span className="text-sm font-semibold text-white tracking-wider uppercase">Secured by 24/7 Pay</span>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center justify-center space-y-8 animate-scale-in">
          {/* Status indicator */}
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            {status === 'loading' ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading payment…</span>
              </div>
            ) : status === 'waiting' ? (
              <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span>Waiting for payment…</span>
              </div>
            ) : status === 'success' ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 animate-pulse" />
                <span>Payment Successful</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <AlertCircle className="w-5 h-5" />
                <span>Payment failed</span>
              </div>
            )}
          </div>

          {/* UTR display (success only) */}
          {status === 'success' && utr && (
            <div className="glass-card px-6 py-3 rounded-xl text-center animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">UTR Reference</span>
              <div className="flex items-center justify-center gap-1 text-xs font-mono text-emerald-300">
                <span>UTR: </span>
                <span className="text-emerald-400">{utr}</span>
              </div>
            </div>
          )}

          {/* Amount - Massive typography */}
          <div className="text-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Amount to Pay</span>
            <div className="mt-1">
              <span className="text-6xl font-extrabold text-white tracking-tight">₹ {amount}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="relative animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <div className="qr-border w-64 h-64 rounded-2xl bg-white/5 p-2 border border-white/10 shadow-2xl flex items-center justify-center">
              {upiUri ? (
                <img
                  src={`/checkout/${encodeURIComponent(paymentId)}/qr.svg`}
                  alt="UPI QR Code"
                  className="w-full h-full rounded-lg bg-white/30 border border-white/10 shadow-inner"
                  loading="eager"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <QrCode className="w-16 h-16 text-slate-500" />
                  <span className="mt-2 text-xs text-slate-500">Generating QR…</span>
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">
              Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
            </p>
          </div>

          {/* Web fallback button */}
          {status !== 'success' && (
            <button
              onClick={openCheckoutInNewTab}
              className="mt-6 w-full py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 font-medium hover:bg-white/10 hover:text-white transition-colors"
            >
              Open in browser
            </button>
          )}
        </main>

        {/* Success confetti overlay */}
        {renderConfetti()}

        {/* Sticky bottom mobile intent button */}
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
          <div className="max-w-md mx-auto">
            <button
              onClick={launchUpiIntent}
              className={`w-full rounded-2xl px-6 py-5 text-white font-bold text-lg shadow-2xl flex items-center justify-center gap-2 transition-all duration-200 ${
                status === 'success'
                  ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/40'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 hover:scale-[1.02] shadow-indigo-500/30'
              }`}
            >
              {status === 'success' ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Paid via UPI
                </>
                : (
                  <>
                    <Phone className="w-5 h-5" />
                    Pay ₹{amount} via UPI App
                  </>
                )}
            </button>
            {status !== 'success' && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Or scan the QR above with your UPI app
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function toastError(msg) {
  // Minimal toast fallback — uses browser alert if sonner not available
  alert(msg)
}
