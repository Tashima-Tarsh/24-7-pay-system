/**
 * TransactionFeed Component — Phase 2: Overview Dashboard
 *
 * Displays a real-time feed of recent payment transactions with SSE
 * updates for live status changes.
 */

'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@24-7-pay/ui';
import { api } from '../hooks/useApi';
import { formatCurrency, formatTime } from '../utils/format';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

export function TransactionFeed() {
  const queryClient = useQueryClient();
  const [transactions, setTransactions] = useState<any[]>([]);

  const { data } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getRecentTransactions(20),
  });

  useEffect(() => {
    if (data) {
      setTransactions(data);
    }
  }, [data]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const ws = new WebSocket('wss://api.24-7-pay.system/feed');

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);

      if (update.type === 'payment.created') {
        setTransactions((prev) => [update.payment, ...prev.slice(0, 19)]);
      }

      if (update.type === 'payment.verified') {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === update.payment.id ? { ...tx, ...update.payment } : tx
          )
        );
      }
    };

    return () => ws.close();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="w-4 h-4 text-success-500" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-danger-500" />;
      case 'QUARANTINED':
        return <AlertTriangle className="w-4 h-4 text-warning-500" />;
      default:
        return <Clock className="w-4 h-4 text-neutral-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      SUCCESS: 'success',
      FAILED: 'danger',
      QUARANTINED: 'warning',
      PENDING: 'default',
    };

    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors animate-in slide-in-from-top">
      {transactions.map((tx, index) => (
        <div
          key={tx.id}
          className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors animate-in slide-in-from-top"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-20">
              <p className="font-mono text-sm text-neutral-100">
                {formatCurrency(tx.amount_paise / 100)}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-neutral-100">Order #{tx.id}</p>
              <p className="text-xs text-neutral-400">
                {formatTime(tx.created_at)}
              </p>
            </div>
          </div>
          {getStatusBadge(tx.status)}
        </div>
      ))}
    </div>
  );
}
