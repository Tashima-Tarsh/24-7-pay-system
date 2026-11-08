/**
 * PaymentDetailDrawer Component — Phase 3: Payments Table + Detail Drawer
 *
 * Drawer view showing detailed payment information including:
 * - Payment status and amount
 * * UTR reference
 * - Verification stages with status
 * - Investigation timeline with timestamps
 * - Metadata (merchant ID, source, etc.)
 */

import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@radix-ui/react-dialog';
import { Card, Badge, Button } from '@24-7-pay/ui';
import { api } from '../hooks/useApi';
import { formatCurrency, formatDate } from '../utils/format';
import { X, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';

interface PaymentDetailDrawerProps {
  paymentId: string;
  onClose: () => void;
}

export function PaymentDetailDrawer({ paymentId, onClose }: PaymentDetailDrawerProps) {
  const { data: payment } = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => api.getPaymentDetail(paymentId),
  });

  if (!payment) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose}>
        <div
          className="fixed right-0 top-0 h-full w-full max-w-2xl bg-neutral-900 border-l border-neutral-800 shadow-2xl overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 p-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-neutral-100">Payment Details</h2>
              <p className="text-sm text-neutral-400 mt-1">Order #{payment.id}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-800">
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Amount & Status */}
            <Card>
              <div className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-400">Amount</p>
                  <p className="text-3xl font-bold text-neutral-100 mt-1">
                    {formatCurrency(payment.amount_paise / 100)}
                  </p>
                </div>
                <Badge variant={getStatusVariant(payment.status)} className="text-base px-4 py-2">
                  {payment.status}
                </Badge>
              </div>
            </div>

            {/* UTR */}
            {payment.utr && (
              <Card>
                <div className="p-6">
                  <p className="text-sm text-neutral-400 mb-2">UTR (Transaction Reference)</p>
                  <p className="font-mono text-lg text-success-500">{payment.utr}</p>
                </div>
              </div>
            )}

            {/* Verification Layers */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-100 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  7-Layer Verification
                </h3>
                <div className="space-y-3">
                  {payment.verification_layers?.map((layer: any) => (
                    <div key={layer.name} className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50">
                      <div className="flex items-center gap-3">
                        {layer.passed ? (
                          <CheckCircle className="w-5 h-5 text-success-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-danger-500" />
                        )}
                        <span className="text-neutral-100">{layer.name}</span>
                      </div>
                      <span className="text-sm text-neutral-400">{layer.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Timeline */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-100 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Timeline
                </h3>
                <div className="space-y-4">
                  {payment.timeline?.map((event: any, index: number) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-primary-500" />
                        {index < payment.timeline.length - 1 && (
                          <div className="w-0.5 flex-1 bg-neutral-700 mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium text-neutral-100">
                          {event.action}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                          {formatDate(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Metadata */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-100 mb-4">Metadata</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Device Fingerprint</span>
                    <span className="font-mono text-neutral-100">
                      {payment.fingerprint_hash?.slice(0, 16)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">IP Address</span>
                    <span className="font-mono text-neutral-100">{payment.ip_address}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Environment Risk</span>
                    <span className="text-neutral-100">{payment.environment_risk_score}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Created</span>
                    <span className="text-neutral-100">{formatDate(payment.created_at)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Dialog>
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
