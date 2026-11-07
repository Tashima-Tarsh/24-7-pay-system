'use client'

import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  ExternalLink,
  ChevronRight,
  Eye,
  EyeOff,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://dynamo-pay-d545.onrender.com';
const MERCHANT_ID = '00000000-0000-0000-000000000001';
const MERCHANT_KEY = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';

const STATUS_LABELS: Record<string, string> = {
  INITIATED: 'Initiated',
  CLIENT_REPORTED_SUCCESS: 'Client Reported',
  MANUAL_VERIFICATION_PENDING: 'Manual Verification',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

export default function TransactionsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, success, failed, pending
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/payments?limit=100`, {
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

  const filteredPayments = payments.filter((p) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'success' &&
        (p.status === 'SUCCESS' || p.status === 'CLIENT_REPORTED_SUCCESS')) ||
      (filter === 'failed' && p.status === 'FAILED') ||
      (filter === 'pending' && p.status === 'MANUAL_VERIFICATION_PENDING');
    const matchesSearch =
      p.orderId.toLowerCase().includes(search.toLowerCase()) ||
      p.paymentId.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const formatAmount = (amount: string | number) => {
    return `₹${Number(amount).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'CLIENT_REPORTED_SUCCESS':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'MANUAL_VERIFICATION_PENDING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'FAILED':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'EXPIRED':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const handleViewDetails = (payment: any) => {
    setSelectedPayment(payment);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Transactions</h2>
          <p className="text-slate-400 text-sm">
            View and manage all your payment transactions
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search order ID or payment ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 pl-10 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="all">All Transactions</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending Verification</option>
          </select>
          <button
            onClick={fetchPayments}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Transactions" value={payments.length} color="text-indigo-400" icon={Activity} />
        <StatCard
          title="Successful"
          value={payments.filter((p) => p.status === 'SUCCESS' || p.status === 'CLIENT_REPORTED_SUCCESS').length}
          color="text-emerald-400"
          icon={CheckCircle}
        />
        <StatCard
          title="Failed"
          value={payments.filter((p) => p.status === 'FAILED').length}
          color="text-red-400"
          icon={AlertCircle}
        />
        <StatCard
          title="Pending"
          value={payments.filter((p) => p.status === 'MANUAL_VERIFICATION_PENDING').length}
          color="text-amber-400"
          icon={Clock}
        />
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-white/5">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Order ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 rounded-r-lg">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr
                    key={p.paymentId}
                    className="hover:bg-white/5 transition-colors group cursor-pointer"
                    onClick={() => handleViewDetails(p)}
                  >
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {p.orderId}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {p.customerName || 'Customer'}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      {formatAmount(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(
                          p.status,
                        )}`}
                      >
                        {STATUS_LABELS[p.status] || status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(p);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 text-sm"
                        title="View details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Details Drawer */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPayment(null)}>
          <div className="bg-slate-950 border border-white/10 rounded-2xl w-full max-w-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">Payment Details</h3>
                <p className="text-slate-400 text-sm">Order #{selectedPayment.orderId}</p>
              </div>
              <button
                onClick={() => setSelectedPayment(null)}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <EyeOff className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <DetailRow label="Payment ID" value={selectedPayment.paymentId} />
                <DetailRow label="Order ID" value={selectedPayment.orderId} />
                <DetailRow label="Amount" value={formatAmount(selectedPayment.amount)} />
                <DetailRow label="Currency" value="INR" />
                <DetailRow label="Method" value="UPI" />
                <DetailRow label="Customer" value={selectedPayment.customerName || 'Not provided'} />
              </div>
              <div className="space-y-4">
                <DetailRow label="Status" value={STATUS_LABELS[selectedPayment.status] || selectedPayment.status} />
                <DetailRow label="Created At" value={formatDate(selectedPayment.createdAt)} />
                <DetailRow label="Merchant ID" value={selectedPayment.merchantId || MERCHANT_ID} />
                {selectedPayment.receivingAccountId && (
                  <DetailRow label="Receiving Account" value={selectedPayment.receivingAccountId} />
                )}
                {selectedPayment.utr && (
                  <DetailRow label="UTR Reference" value={selectedPayment.utr} />
                )}
              </div>
            </div>

            <div className="mt-8">
              <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Status History</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Payment Initiated</p>
                    <p className="text-xs text-slate-400">{formatDate(selectedPayment.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Status: {STATUS_LABELS[selectedPayment.status] || selectedPayment.status}</p>
                    <p className="text-xs text-slate-400">{formatDate(selectedPayment.updatedAt || selectedPayment.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, icon: Icon }) {
  return (
    <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
      <div className={`p-3 rounded-xl bg-white/5 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm font-medium text-white font-mono">{value}</p>
    </div>
  );
}
