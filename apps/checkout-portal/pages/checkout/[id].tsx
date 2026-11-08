import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '../../components/layout';
import { Card, Button, Input } from '../../components';
import { getPayment, verifyCallback, isAuthenticated } from '../../lib/api';

export const dynamic = 'force-dynamic';

interface PaymentDetail {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
  completedAt?: string | null;
  receivingVpa?: string;
  receivingAccount?: string;
}

export default function CheckoutPage({ query }: { query: { id?: string } }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [utr, setUtr] = useState('');
  const [token, setToken] = useState('');
  const [responseCode, setResponseCode] = useState('00');
  const [amount, setAmount] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [returnedAt, setReturnedAt] = useState(Date.now());
  const [appOpenedAt, setAppOpenedAt] = useState(Date.now() - 30000);

  const paymentIdRef = useRef<string>('');

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = '/login';
      return;
    }
    if (!query || !query.id) {
      router.push('/payments');
      return;
    }
    paymentIdRef.current = query.id;
    loadPayment();
  }, [query, router]);

  async function loadPayment() {
    try {
      const data = await getPayment(query.id!);
      const receivingVpa = data.metadata?.receivingAccountSnapshot?.upiId || data.metadata?.upiId || '';
      setPayment({ ...data, receivingVpa });
      setAmount(data.amount);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    SUCCESS: 'text-emerald-600 bg-emerald-50',
    FAILED: 'text-rose-600 bg-rose-50',
    PENDING: 'text-amber-600 bg-amber-50',
    PROCESSING: 'text-blue-600 bg-blue-50',
    QUARANTINED: 'text-purple-600 bg-purple-50',
    EXPIRED: 'text-slate-600 bg-slate-50',
    CANCELLED: 'text-slate-600 bg-slate-50',
  };

  // Generate UPI QR code URI using actual receiving VPA from payment metadata
  const receivingVpa = payment?.receivingVpa || 'merchant@upi';
  const upiUri = payment ? `upi://pay?pa=${encodeURIComponent(receivingVpa)}&pn=Merchant&am=${payment.amount.replace('₹', '')}&cu=${payment.currency}&tn=Order%20#${payment.orderId}` : '';

  async function handleVerify() {
    if (!paymentIdRef.current) return;
    setVerifying(true);
    setError('');
    setSuccess(false);

    try {
      await verifyCallback(paymentIdRef.current, {
        token,
        utr,
        responseCode,
        amount,
        fingerprint,
        returnedAt,
        appOpenedAt,
      });
      setSuccess(true);
      setPayment({ ...payment!, status: 'SUCCESS' });
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
          <p className="text-slate-600">Loading payment...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Checkout</h1>
            <p className="text-slate-600">Order #{payment?.orderId}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push('/payments')}
            className="hidden md:flex"
          >
            ← Back to payments
          </Button>
        </div>

        {!success && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Amount & QR */}
            <Card className="lg:col-span-1">
              <div className="card-body">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Amount to Pay</h3>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-5xl font-bold text-slate-900">{payment?.amount}</span>
                </div>
                {payment?.receivingVpa && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pay to VPA</p>
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="font-mono text-sm text-slate-900">{payment.receivingVpa}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(payment.receivingVpa!);
                        }}
                        className="ml-2 px-2 py-1 bg-slate-200 rounded text-slate-700 text-xs hover:bg-slate-300"
                        title="Copy VPA"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-200 mb-4">
                  <img
                    src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(upiUri)}&choe=UTF-8`}
                    alt="UPI QR Code"
                    className="w-32 h-32"
                  />
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
                </p>
              </div>
            </Card>

            {/* Middle: Payment Status */}
            <Card className="lg:col-span-1">
              <div className="card-body">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Payment Status</h3>
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[payment?.status || 'PENDING'] || 'badge-default'}`}>
                    {payment?.status || 'PENDING'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order ID</span>
                    <span className="font-mono text-slate-900">#{payment?.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment ID</span>
                    <span className="font-mono text-slate-900 truncate">{payment?.paymentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Method</span>
                    <span className="text-slate-900">{payment?.method || 'UPI'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Completed</span>
                    <span className="text-slate-900">{payment?.completedAt ? new Date(payment.completedAt).toLocaleString() : '—'}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Right: Verify Callback */}
            <Card className="lg:col-span-1">
              <div className="card-body">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Verify Payment Callback</h3>
                <p className="text-xs text-slate-500 mb-4">Enter UPI app return details to verify payment.</p>

                <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }} className="space-y-3">
                  <Input
                    label="UTR"
                    placeholder="e.g. SBI1234567890"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                  />
                  <Input
                    label="Response Code"
                    placeholder="00"
                    value={responseCode}
                    onChange={(e) => setResponseCode(e.target.value)}
                  />
                  <Input
                    label="Amount (₹)"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Input
                    label="Fingerprint"
                    placeholder="device fingerprint hash"
                    value={fingerprint}
                    onChange={(e) => setFingerprint(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Returned At (ms)"
                      type="number"
                      value={String(returnedAt)}
                      onChange={(e) => setReturnedAt(parseInt(e.target.value) || Date.now())}
                    />
                    <Input
                      label="App Opened At (ms)"
                      type="number"
                      value={String(appOpenedAt)}
                      onChange={(e) => setAppOpenedAt(parseInt(e.target.value) || Date.now() - 30000)}
                    />
                  </div>
                  <Input
                    label="Signed Token"
                    placeholder="base64 encoded signed order token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  {error && <p className="text-sm text-rose-600">{error}</p>}
                  <Button type="submit" variant="primary" className="w-full" loading={verifying}>
                    {verifying ? 'Verifying...' : 'Verify Callback'}
                  </Button>
                </form>
              </div>
            </Card>
          </div>
        )}

        {success && (
          <Card className="border-emerald-200 bg-emerald-50">
            <div className="card-body p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-emerald-900 mb-1">Payment Verified</h3>
              <p className="text-sm text-emerald-700">The payment has been successfully verified.</p>
              <Button variant="secondary" onClick={() => router.push('/payments')} className="mt-4">
                Back to Payments
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
