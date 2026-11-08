'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Lock,
  RefreshCw,
  CheckCircle2,
  Phone,
  QrCode,
  AlertCircle,
  X
} from 'lucide-react'

export default function CheckoutPage() {
  const router = useRouter()
  const paymentId = (router.query as { id?: string }).id
  
  const [status, setStatus] = useState('loading') // 'loading' | 'waiting' | 'verifying' | 'success' | 'error'
  const [amount, setAmount] = useState('0.00')
  const [utr, setUtr] = useState('')
  const [upiUri, setUpiUri] = useState('')
  const [confetti, setConfetti] = useState(0)
  
  // Manual verification states
  const [showManualConfirm, setShowManualConfirm] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [showUtrModal, setShowUtrModal] = useState(false)
  const [manualUtr, setManualUtr] = useState('')

  // Fetch payment state from backend
  const fetchPayment = useCallback(async () => {
    if (!paymentId) return
    try {
      const res = await fetch(`/api/v1/checkout/${encodeURIComponent(paymentId)}/state`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Payment not found')
      const data = await res.json()
      setAmount(data?.amount || '0.00')
      setUpiUri(data?.upiUri || '')
      
      if (data?.status === 'SUCCESS' || data?.status === 'VERIFIED' || data?.status === 'CLIENT_REPORTED_SUCCESS') {
        setStatus('success')
        setUtr(data?.utr || data?.bankReferenceNumber || 'UNKNOWN')
        setConfetti(Date.now())
      } else if (data?.status === 'FAILED' || data?.status === 'EXPIRED') {
        setStatus('error')
      } else if (data?.status === 'MANUAL_VERIFICATION_PENDING' || data?.status === 'VERIFYING') {
        setStatus('verifying')
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

  // 1. Handle Auto UPI App Return (URL Params)
  useEffect(() => {
    if (!paymentId || status === 'success') return

    const urlParams = new URLSearchParams(window.location.search)
    const upiStatus = urlParams.get('Status') || urlParams.get('status')
    const txnRef = urlParams.get('txnRef') || urlParams.get('tr') || urlParams.get('txnId')

    // If the UPI app returned with a status, report it to the server
    if (upiStatus && txnRef) {
      const reportClientReturn = async () => {
        try {
          await fetch(`/api/v1/payments/${encodeURIComponent(paymentId)}/client-return`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'idempotency-key': `return_${paymentId}_${txnRef}` // Prevents double-firing
            },
            body: JSON.stringify({
              sourcePlatform: 'WEB_CHECKOUT',
              parsedStatus: upiStatus.toUpperCase(),
              upiTransactionReference: txnRef,
              eventTimestamp: new Date().toISOString()
            })
          })
          // Clear URL params so it doesn't re-fire on refresh
          window.history.replaceState({}, document.title, window.location.pathname)
        } catch (err) {
          console.error('Failed to report client return:', err)
        }
      }
      reportClientReturn()
    }
  }, [paymentId, status])

  // 2. SSE for real-time status updates
  useEffect(() => {
    if (!paymentId) return
    const evtSource = new EventSource(`/api/v1/checkout/${encodeURIComponent(paymentId)}/stream`)
    evtSource.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data)
        const newStatus = update.payload?.status || update.status
        if (newStatus === 'SUCCESS' || newStatus === 'VERIFIED' || newStatus === 'CLIENT_REPORTED_SUCCESS' || newStatus === 'paid') {
          setStatus('success')
          setUtr(update.payload?.utr || update.payload?.bankReferenceNumber || 'UNKNOWN')
          setConfetti(Date.now())
        } else if (newStatus === 'FAILED' || newStatus === 'EXPIRED') {
          setStatus('error')
        } else if (newStatus === 'MANUAL_VERIFICATION_PENDING' || newStatus === 'VERIFYING') {
          setStatus('verifying')
        }
      } catch {}
    }
    evtSource.onerror = () => {
      evtSource.close()
    }
    return () => evtSource.close()
  }, [paymentId])

  // 3. Show manual button ONLY after 60 seconds of waiting
  useEffect(() => {
    if (status === 'waiting') {
      const timer = setTimeout(() => {
        setShowManualConfirm(true)
      }, 60000) // 60 seconds
      return () => clearTimeout(timer)
    }
  }, [status])

  const launchUpiIntent = () => {
    if (!upiUri) return
    window.location.href = upiUri
  }

  // 4. Handle Manual UTR Submission
  const handleManualConfirm = async () => {
    if (!/^\d{12}$/.test(manualUtr)) {
      alert('Please enter a valid 12-digit UTR number.')
      return
    }

    setIsVerifying(true)
    try {
      const response = await fetch(`/api/v1/payments/${encodeURIComponent(paymentId)}/manual-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utr: manualUtr,
          merchantId: '00000000-00000000-000000000001' // Update if dynamic
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Verification request failed')
      }
      
      setShowUtrModal(false)
      setStatus('verifying') // Show verifying state while backend checks
    } catch (err) {
      console.error('Manual confirmation failed:', err)
      setIsVerifying(false)
      alert(err.message || 'Could not verify payment. Please check your UTR.')
    }
  }

  const renderConfetti = () => {
    if (!confetti) return null
    const colors = [220, 280, 320, 340, 30, 60, 180]
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
          } as any}
        />
      )
    })
    return <div className="pointer-events-none fixed inset-0 z-50">{pieces}</div>
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
        <header className="flex items-center gap-2 mb-10">
          <Lock className="w-5 h-5 text-white/80" />
          <span className="text-sm font-semibold text-white tracking-wider uppercase">Secured by 24/7 Pay</span>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center space-y-8 animate-scale-in">
          {/* Status indicator */}
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            {status === 'loading' && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading payment…</span>
              </div>
            )}
            {status === 'waiting' && (
              <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span>Waiting for payment…</span>
              </div>
            )}
            {status === 'verifying' && (
              <div className="flex flex-col items-center gap-2 text-amber-400 text-sm font-medium">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Verifying with bank...</span>
                <p className="text-xs text-slate-400 text-center max-w-xs mt-1">Confirming your UTR. This usually takes 1-2 minutes.</p>
              </div>
            )}
            {status === 'success' && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 animate-pulse" />
                <span>Payment Successful</span>
              </div>
            )}
            {status === 'error' && (
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <AlertCircle className="w-5 h-5" />
                <span>Payment failed or expired</span>
              </div>
            )}
          </div>

          {status === 'success' && utr && (
            <div className="glass-card px-6 py-3 rounded-xl text-center animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">UTR Reference</span>
              <div className="flex items-center justify-center gap-1 text-xs font-mono text-emerald-300">
                <span>UTR: </span>
                <span className="text-emerald-400">{utr}</span>
              </div>
            </div>
          )}

          <div className="text-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Amount to Pay</span>
            <div className="mt-1">
              <span className="text-6xl font-extrabold text-white tracking-tight">₹ {amount}</span>
            </div>
          </div>

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
          {status !== 'success' && status !== 'verifying' && (
            <button
              onClick={() => window.open(`/checkout/${paymentId}`, '_blank')}
              className="mt-6 w-full py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400 font-medium hover:bg-white/10 hover:text-white transition-colors"
            >
              Open in browser
            </button>
          )}

          {/* Manual UTR entry button */}
          {(status === 'waiting' || status === 'verifying') && (
            <button
              onClick={() => setShowUtrModal(true)}
              className="mt-4 w-full py-3 rounded-xl bg-white/5 border border-white/20 text-amber-300 font-medium hover:bg-white/10 hover:text-white transition-colors"
            >
              {status === 'verifying' ? 'Already submitted UTR? Check status' : 'Enter UTR Manually'}
            </button>
          )}
        </main>

        {renderConfetti()}

        {/* Adaptive Sticky Bottom Footer */}
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
          <div className="max-w-md mx-auto">
            
            {status === 'waiting' && (
              <>
                <button
                  onClick={launchUpiIntent}
              className="w-full rounded-2xl px-6 py-5 text-white font-bold text-lg shadow-2xl flex items-center justify-center gap-2 transition-all duration-200 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 hover:scale-[1.02] shadow-indigo-500/30"
                >
                  <Phone className="w-5 h-5" />
                  Pay ₹{amount} via UPI App
                </button>
                
                {/* ONLY SHOWS AFTER 60 SECONDS */}
                {showManualConfirm && (
                  <button
                    onClick={() => setShowUtrModal(true)}
                    className="w-full mt-3 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 border flex items-center justify-center gap-2 bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white"
                  >
                    <AlertCircle className="w-4 h-4" />
                    I have already paid
                  </button>
                )}
              </>
            )}

            {status === 'verifying' && (
              <div className="w-full rounded-2xl px-6 py-4 text-white font-bold text-lg shadow-2xl flex items-center justify-center gap-2 bg-amber-500 shadow-amber-500/40">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Verifying with Bank…
              </div>
            )}

            {status === 'success' && (
              <button className="w-full rounded-2xl px-6 py-4 text-white font-bold text-lg shadow-2xl flex items-center justify-center gap-2 bg-emerald-500 shadow-emerald-500/40 cursor-default">
                <CheckCircle2 className="w-5 h-5" />
                Payment Successful
              </button>
            )}
            
            {status === 'error' && (
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-2xl px-6 py-4 text-white font-bold text-lg shadow-2xl flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Try Again
              </button>
            )}
            {status !== 'success' && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Or scan the QR above with your UPI app
              </p>
            )}
          </div>
        </div>

        {/* UTR Verification Modal */}
        {showUtrModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-scale-in">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Verify Payment</h3>
                <button
                  onClick={() => setShowUtrModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-slate-400 mb-4">
                Enter the <span className="text-indigo-400 font-semibold">12-digit UTR</span> from your bank or UPI app success screen to verify your payment.
              </p>
              
              <input
                type="text"
                maxLength={12}
                placeholder="e.g., 319283746501"
                value={manualUtr}
                onChange={(e) => setManualUtr(e.target.value.replace(/\D/g, ''))} // Only allow numbers
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-center text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              />
              
              <button
                onClick={handleManualConfirm}
                disabled={isVerifying || manualUtr.length !== 12}
                className={`w-full rounded-xl px-6 py-3 text-white font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                  isVerifying || manualUtr.length !== 12
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30'
                }`}
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Complete'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
