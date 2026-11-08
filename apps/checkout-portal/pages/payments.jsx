/**
 * Payments Page — Phase 3: Payments Table + Detail Drawer
 *
 * Virtualized table of all payments with filters, status filtering,
 * and a detail drawer for viewing individual payment details.
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, Input, Badge, Button } from '@24-7-pay/ui';
import { api } from '../hooks/useApi';
import { PaymentDetailDrawer } from '../components/PaymentDetailDrawer';
import { formatCurrency, formatDate } from '../utils/format';
import { Search, Download } from 'lucide-react';
import { useRef } from 'react';

export function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', { search, status: statusFilter }],
    queryFn: () => api.getPayments({ search, status: statusFilter, limit: 1000 }),
  });

  const virtualizer = useVirtualizer({
    count: payments?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
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
              icon={<Search className="w-4 h-4" />}
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

      {/* Virtualized Table */}
      <Card>
        <div ref={parentRef} className="h-[600px] overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const payment = payments![virtualRow.index];

              return (
                <div
                  key={payment.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 hover:bg-neutral-800/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedPayment(payment.id)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-20">
                        <p className="font-mono text-sm text-neutral-100">
                          {formatCurrency(payment.amount_paise / 100)}
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-neutral-100">
                          Order #{payment.id}
                        </p>
                        <p className="text-xs text-neutral-400 font-mono">
                          {payment.utr || 'No UTR'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={getStatusVariant(payment.status)}>
                        {payment.status}
                      </Badge>
                      <span className="text-sm text-neutral-400">
                        {formatDate(payment.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
