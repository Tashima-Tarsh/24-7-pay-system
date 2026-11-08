/**
 * Checkout Page — Phase 6: UPI Intent Checkout
 *
 * Mobile-first checkout flow for UPI payments.
 * Handles UPI app return, client-return reporting, and verification.
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@youpi/ui';
import { CheckCircle, XCircle, Lock, Phone } from 'lucide-react';

interface PaymentSession {
  id: string;
  order_id: string;
  amount_paise: number;
  currency: string;
  status: string;
  upi_uri: string;
  qr_image?: string;
  receiving_account_id: string;
  created_at: string;
}

interface VerifyResult {
  status: 'SUCCESS' | 'FAILED' | 'UNKNOWN' | 'QUARANTINED';
  order_id?: string;
  upi_transaction_reference?: string;
  amount?: number;
  message?: string;
}

export default function CheckoutPage({ paymentId }: { paymentId: string }) {
  const [state, setState] = useState<PaymentSession | null>(null);
  const [returnStatus, setReturnStatus] = useState<'success' | 'failure' | null>(null);
  const [returnMessage, setReturnMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch payment session details
  useEffect(() => {
    if (!paymentId) return;

    fetch(`/api/v1/payments/${encodeURIComponent(paymentId)}`)
      .then((res) => res.json())
      .then((data) => {
        setState({
          id: data.id || data.paymentId,
          order_id: data.order_id,
          amount_paise: data.amount_paise,
          currency: data.currency || 'INR',
          status: data.status,
          upi_uri: data.upi_uri,          receiving_account_id: data.receiving_account_id,
          created_at: data.created_at,
        });
      })
      .catch((err) => {
        console.error('Failed to fetch payment:', err);
        setError('Failed to load payment details');
      });
  }, [paymentId]);

  // Handle UPI app return via URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upiStatus = params.get('Status') || params.get('status');
    const txnRef = params.get('txnRef') || params.get('tr') || params.get('txnId');

    if (upiStatus && txnRef && state) {
      submitClientReturn({
        transaction_ref: txnRef,
        response_code: upiStatus.toUpperCase(),
        amount: state.amount_paise / 100,
        returned_at: Date.now(),
        app_opened_at: parseInt(sessionStorage.getItem('app_opened_at') || '0'),
      });
    }
  }, [state]);

  const submitClientReturn = async (data: {
    transaction_ref: string;
    response_code: string;
    amount: number;
    returned_at: number;
    app_opened_at: number;
  }) => {
    try {
      const res = await fetch(`/api/v1/payments/${encodeURIComponent(paymentId!)}/client-return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error('Verification failed');
      }

      const result: VerifyResult = await res.json();

      if (result.status === 'SUCCESS') {
        setReturnStatus('success');
        setReturnMessage('Payment verified successfully!');
        setState((prev) => ({ ...prev, status: 'SUCCESS' as const }));
      } else if (result.status === 'FAILED') {
        setReturnStatus('failure');
        setReturnMessage(result.message || 'Payment verification failed');
        setState((prev) => ({ ...prev, status: 'FAILED' as const }));
      } else {
        setReturnStatus('failure');
        setReturnMessage(result.message || 'Payment verification failed');
      }
    } catch (err) {
      console.error('Payment verification error:', err);
      setReturnStatus('failure');
      setReturnMessage('Payment verification failed');
    }
  };

  const handlePayClick = () => {
    if (!state?.upi_uri) return;
    window.location.href = state.upi_uri;
  };

  if (!state) {
    return (
      <div className="flex items-center justify-center h-screen text-neutral-400">
        <div className="animate-pulse rounded-full h-8 w-8 bg-neutral-600"></div>
      </div>
    );
  }

  if (returnStatus === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 p-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold text-neutral-100 mb-2">Payment Successful</h1>
        <p className="text-neutral-400 text-center mb-6 max-w-md">
          Your payment of ₹{(state.amount_paise / 100).toFixed(2)} has been verified successfully.
        </p>
        <Button variant="primary" onClick={() => window.location.href = '/checkout/success'}>
          Back to Home
        </Button>
      </div>
    );
  }

  if (returnStatus === 'failure') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 p-4">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-neutral-100 mb-2">Payment Failed</h1>
        <p className="text-neutral-400 text-center mb-6 max-w-md">
          {returnMessage || 'Your payment could not be verified.'}
        </p>
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try Again
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = '/checkout/new'}>
            New Payment
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary-500" />
            <span className="text-sm font-medium text-neutral-200 uppercase tracking-wider">
              Secure Checkout
            </span>
          </div>
          <div className="text-right text-xs text-neutral-400">
            <span className="block">Order #{state.order_id}</span>
            <span className="text-xs text-neutral-600">Expires in 15 min</span>
          </div>
        </div>

        {/* Amount */}
        <div className="text-center mb-8">
          <p className="text-sm font-medium text-neutral-400">Amount to Pay</p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-6xl font-bold text-neutral-100">₹{state.amount_paise / 100}</span>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-64 h-64 rounded-xl bg-white/5 p-4 border border-neutral-700 shadow-lg flex items-center justify-center">
            <img
              src={`${state.qr_image || `/api/v1/payments/${state.id}/qr`}`}
              alt="UPI QR Code"
              className="w-full h-full rounded-lg bg-white"
            />
          </div>
          <p className="text-sm text-neutral-400">
            Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
          </p>
        </div>

        {/* Pay Button */}
        <div className="w-full">
          <Button
            className="w-full h-12 text-xl font-bold"
            onClick={handlePayClick}
            disabled={!state?.upi_uri}
          >
            <Phone className="w-5 h-5 mr-2" />
            Pay ₹{state.amount_paise / 100} via UPI App
          </Button>
        </div>

        <div className="mt-8 text-sm text-neutral-400 text-center">
          <p>Don't have a UPI app?</p>
          <Button variant="secondary" className="w-full mt-2" onClick={() => {}}>
            Enter UTR Manually
          </Button>
        </div>
      </div>
    </div>
  );
}
