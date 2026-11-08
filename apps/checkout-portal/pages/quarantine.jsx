/**
 * Quarantine Page — Phase 4: Quarantine Review Queue
 *
 * Reviews quarantined payments flagged by the fraud detection pipeline.
 * Keyboard navigation: j/k navigate, v verify, r reject.
 */

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button } from '@24-7-pay/ui';
import { api } from '../hooks/useApi';
import { formatCurrency, formatDate } from '../utils/format';
import { CheckCircle, XCircle, AlertTriangle, Keyboard } from 'lucide-react';

interface QuarantinedOrder {
  id: string;
  amount_paise: number;
  merchant_id: string;
  environment_risk_score: number;
  environment_risk_details: string | null;
  utr: string | null;
  created_at: string;
}

export function QuarantinePage() {
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['quarantine'],
    queryFn: () => api.getQuarantinedOrders(),
    refetchInterval: 5000,
  });

  const verifyMutation = useMutation({
    mutationFn: (orderId: string) => api.verifyQuarantinedOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      toast.success('Order verified and credited');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (orderId: string) => api.rejectQuarantinedOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      toast.success('Order rejected');
    },
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!orders?.length) return;

      switch (e.key) {
        case 'j':
          setSelectedIndex((i) => Math.min(i + 1, orders.length - 1));
          break;
        case 'k':
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'v':
          if (orders[selectedIndex]) {
            verifyMutation.mutate(orders[selectedIndex].id);
          }
          break;
        case 'r':
          if (orders[selectedIndex]) {
            rejectMutation.mutate(orders[selectedIndex].id);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, selectedIndex, verifyMutation, rejectMutation]);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-neutral-800 animate-pulse flex items-center justify-center">
            <svg className="w-3 h-3 text-neutral-400 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-neutral-400">Loading quarantined orders...</p>
        </div>
      </div>
    </div>
  );

  if (!orders?.length) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-neutral-100">No quarantined orders</h2>
        <p className="text-neutral-400 mt-2">All payments are processing normally</p>
      </div>
    );
  }

  const order = orders[selectedIndex];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-100">Quarantine Queue</h1>
          <p className="text-neutral-400 mt-1">
            {orders.length} payment{orders.length !== 1 ? 's' : ''} require manual verification
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <Keyboard className="w-4 h-4" />
          <span>j/k navigate • v verify • r reject</span>
        </div>
      </div>

      <div className="space-y-4">
        {orders.map((order, index) => (
          <Card
            key={order.id}
            className={cn(
              'p-6',
              selectedIndex === index ? 'ring-2 ring-primary-500' : ''
            )}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-neutral-100">
                      Order #{order.id}
                    </h3>
                    <Badge variant="warning">High Risk</Badge>
                  </div>
                  <p className="text-sm text-neutral-400 mt-1">
                    {formatDate(order.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-neutral-100">
                    {formatCurrency(order.amount_paise / 100)}
                  </p>
                </div>
              </div>

              <div className="bg-neutral-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-neutral-400 mb-2">Claimed UTR:</p>
                <p className="font-mono text-lg text-success-500">{order.utr}</p>
              </div>

              <div className="bg-neutral-800 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-400">Environment Risk Score</p>
                  <p className="text-lg font-bold text-warning-500">
                    {order.environment_risk_score}/100
                  </p>
                </div>
                <div className="w-full bg-neutral-700 rounded-full h-2">
                  <div
                    className="bg-warning-500 h-2 rounded-full transition-all"
                    style={{ width: `${order.environment_risk_score}%` }}
                  />
                </div>
                {order.environment_risk_details && (
                  <p className="text-xs text-neutral-500 mt-2">
                    {order.environment_risk_details}
                  </p>
                )}
              </div>

              <div className="bg-info-500/10 border border-info-500/20 rounded-lg p-4 mb-4">
                <p className="text-sm text-info-500">
                  <strong>Instructions:</strong> Open your bank app and verify you received{' '}
                  <span className="font-semibold">{formatCurrency(order.amount_paise / 100)}</span>{' '}
                  with UTR <span className="font-mono">{order.utr}</span>.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="success"
                  className="flex-1"
                  onClick={() => verifyMutation.mutate(order.id)}
                  loading={verifyMutation.isLoading}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Verify & Credit (v)
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => rejectMutation.mutate(order.id)}
                  loading={rejectMutation.isLoading}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject (r)
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
