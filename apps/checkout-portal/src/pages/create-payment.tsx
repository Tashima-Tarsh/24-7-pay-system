import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, Input, Button } from '../../components';
import { createPayment } from '../../lib/api';

export default function CreatePaymentPage() {
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [returnUrl, setReturnUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await createPayment({
        orderId,
        amount,
        currency,
        customer: customerName || customerEmail ? { name: customerName || undefined, email: customerEmail || undefined } : undefined,
        returnUrl: returnUrl || undefined,
      });
      setCreated(res);
    } catch (err: any) {
      setError(err.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Create Payment</h1>
          <p className="text-slate-600">Create a new payment order for your customer</p>
        </div>
        <Link to="/" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">← Back to dashboard</Link>
      </div>

      {created && (
        <Card className="border-emerald-200 bg-emerald-50 mb-6">
          <div className="card-body">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-emerald-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              <div>
                <h3 className="text-sm font-semibold text-emerald-900">Payment created successfully</h3>
                <p className="text-sm text-emerald-700 mt-1">
                  Order <strong>#{created.orderId}</strong> — {created.amount} ({created.status})
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                onClick={() => window.location.href = created.checkoutUrl}
                className="flex-1"
              >
                Open Checkout
              </Button>
              <Button variant="secondary" onClick={() => setCreated(null)}>
                Create Another
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="h-full">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-slate-900">Payment Details</h3>
        </div>
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Order ID"
              placeholder="e.g. ORD-2024-001"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              required
            />
            <Input
              label="Amount (₹)"
              type="number"
              placeholder="e.g. 1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
            <Input
              label="Customer Name (optional)"
              placeholder="John Doe"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <Input
            label="Customer Email (optional)"
            type="email"
            placeholder="john@example.com"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
          <Input
            label="Return URL (optional)"
            placeholder="https://your-site.com/payment-success"
            value={returnUrl}
            onChange={(e) => setReturnUrl(e.target.value)}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            {loading ? 'Creating...' : 'Create Payment'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
