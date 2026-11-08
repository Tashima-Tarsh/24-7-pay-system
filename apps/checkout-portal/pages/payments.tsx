/**
 * Payments Page — Phase 3: Payments Table + Detail Drawer
 *
 * Table of all payments with filters, status filtering,
 * and a detail drawer for viewing individual payment details.
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Input, Badge, Button } from '@youpi/ui';
import { api } from '../hooks/useApi';
import { PaymentDetailDrawer } from '../components/PaymentDetailDrawer';
import { formatCurrency, formatDate } from '../utils/format';
import { Search, Download } from 'lucide-react';

export default function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', { search, status: statusFilter }],
    queryFn: () => api.getPayments({ search, status: statusFilter, limit: 1000 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-100">Payments</h1>
          <p className="text-neutral-400 mt-1">
            All transactions and their verification status
          </p>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search by Order ID, UTR, amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Status</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-neutral-400 uppercase bg-neutral-800">
              <tr>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">UTR</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {(payments ?? []).map((payment: any) => (
                <tr key={payment.id} className="hover:bg-neutral-800/50 cursor-pointer transition-colors" onClick={() => setSelectedPayment(payment.id)}>
                  <td className="px-4 py-3 font-mono text-neutral-100">
                    {formatCurrency(payment.amount_paise / 100)}
                  </td>
                  <td className="px-4 py-3 text-neutral-100">Order #{payment.id}</td>
                  <td className="px-4 py-3 text-neutral-400 font-mono">
                    {payment.utr || 'No UTR'}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <Badge variant={getStatusVariant(payment.status)}>
                      {payment.status}
                    </Badge>
                    <span className="text-sm text-neutral-400 ml-2">
                      {formatDate(payment.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Drawer */}
      {selectedPayment && (
        <PaymentDetailDrawer
          paymentId={selectedPayment}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </div>
  );
}

function getStatusVariant(status: string): 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'QUARANTINED':
      return 'warning';
    default:
      return 'default';
  }
}
