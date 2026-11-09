import React, { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, Button } from '../../components';
import { getPayments, isAuthenticated } from '../../lib/api';

interface PaymentRow {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
  completedAt?: string | null;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = '/login';
      return;
    }
    loadPayments();
  }, []);

  async function loadPayments() {
    try {
      const data = await getPayments();
      setPayments(data || []);
    } catch (err) {
      console.error('Failed to load payments:', err);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
        <p>Loading payments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-slate-600">All transactions and their verification status</p>
        </div>
        <Link to="/create-payment">
          <Button variant="primary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            New Payment
          </Button>
        </Link>
      </div>

      <Card className="h-full">
        <div className="card-body">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider">Order ID</th>
                  <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-right">Method</th>
                  <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-right">Date</th>
                  <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(payments || []).map((p) => (
                  <tr key={p.paymentId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-mono text-slate-900">{p.amount}</td>
                    <td className="py-3 text-slate-700">#{p.orderId}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[p.status] || 'badge-default'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500 text-right">
                      {p.method || '—'}
                    </td>
                    <td className="py-3 text-slate-500 text-right">
                      {p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <Link to={`/checkout/${p.paymentId}`}>
                        <Button variant="secondary" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {(payments?.length || 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No payments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
