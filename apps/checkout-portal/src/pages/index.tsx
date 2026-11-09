import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Card, MetricCard, Button } from '../../components';
import { getMetrics, getPayments, isAuthenticated } from '../../lib/api';

interface PaymentRow {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
  completedAt?: string | null;
}

export default function IndexPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<{
    totalCollected: string;
    totalPayments: number;
    successfulPayments: string;
    awaitingConfirmation: number;
  } | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate({ to: '/login' });
      return;
    }
    loadData();
  }, [navigate]);

  async function loadData() {
    try {
      const [m, p] = await Promise.all([getMetrics(), getPayments()]);
      setMetrics(m);
      setPayments(p);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
        <p>Loading...</p>
      </div>
    );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
          <p className="text-slate-600">Payments, collections and the details that need your attention.</p>
        </div>
        <Link to="/create-payment">
          <Button variant="primary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Create Payment
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Collected"
          value={metrics?.totalCollected || '₹0.00'}
          subtitle="Confirmed prepaid receipts"
        />
        <MetricCard
          title="Total Payments"
          value={String(metrics?.totalPayments || 0)}
          subtitle="Your recorded payment activity"
        />
        <MetricCard
          title="Successful Payments"
          value={metrics?.successfulPayments || '—'}
          subtitle="Share of completed prepaid attempts"
        />
        <MetricCard
          title="Awaiting Confirmation"
          value={String(metrics?.awaitingConfirmation || 0)}
          subtitle="Payments still in progress"
        />
      </div>

      <Card className="h-full">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Recent Payments</h3>
          <Link to="/payments" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">View all →</Link>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="pb-3 font-medium text-slate-500 uppercase tracking-wider text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {(payments?.slice(0, 10) || []).map((p) => (
                <tr key={p.paymentId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 font-mono text-slate-900">{p.amount}</td>
                  <td className="py-3 text-slate-700">#{p.orderId}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[p.status] || 'badge-default'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 text-slate-500 text-right">
                    {p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {(payments?.length || 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No payments yet. Create your first payment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
