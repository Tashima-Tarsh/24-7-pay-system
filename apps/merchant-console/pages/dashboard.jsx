'use client'

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  CreditCard,
  Code,
  Settings,
  LogOut,
  ShieldCheck,
  Activity,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://dynamo-pay-d545.onrender.com';
const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';
const MERCHANT_KEY = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';

export async function getServerSideProps() {
  return { props: { noLayout: false } };
}

export default function Dashboard() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/payments?limit=5`, {
        headers: {
          'x-merchant-id': MERCHANT_ID,
          'x-merchant-key': MERCHANT_KEY,
        },
      });
      const data = await res.json();
      setPayments(data.data?.payments || []);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalVolume = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const successCount = payments.filter(
    (p) => p.status === 'SUCCESS' || p.status === 'CLIENT_REPORTED_SUCCESS',
  ).length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <button
          onClick={fetchPayments}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Total Volume (Recent)"
          value={`₹${totalVolume.toFixed(2)}`}
          icon={TrendingUp}
          color="text-emerald-400"
        />
        <MetricCard
          title="Successful Payments"
          value={successCount}
          icon={CheckCircle}
          color="text-indigo-400"
        />
        <MetricCard
          title="Pending Verification"
          value={payments.filter((p) => p.status === 'MANUAL_VERIFICATION_PENDING').length}
          icon={AlertCircle}
          color="text-amber-400"
        />
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Transactions</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading transactions...</div>
        ) : payments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No transactions found. Create a test payment!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-white/5">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Order ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-r-lg">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((p) => (
                  <tr
                    key={p.paymentId}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {p.orderId}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      ₹{p.amount}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }) {
  return (
    <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 flex items-center gap-4">
      <div className={`p-3 rounded-xl bg-white/5 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    SUCCESS: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    CLIENT_REPORTED_SUCCESS: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    MANUAL_VERIFICATION_PENDING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
    EXPIRED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  const defaultStyle = 'bg-slate-500/20 text-slate-400 border-slate-500/30';

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || defaultStyle}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
