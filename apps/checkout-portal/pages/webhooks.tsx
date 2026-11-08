/**
 * Webhooks Page — Phase 7: Webhooks Configuration
 *
 * Configure webhook URLs for payment notifications and test webhook delivery.
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Input } from '@youpi/ui';
import { api } from '../hooks/useApi';
import { Link2, CheckCircle, XCircle } from 'lucide-react';

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const { data: webhook } = useQuery({
    queryKey: ['webhook-config'],
    queryFn: () => api.getWebhookConfig(),
  });

  const testWebhookMutation = useMutation({
    mutationFn: (webhookUrl: string) => api.testWebhook(webhookUrl),
    onSuccess: () => {
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    },
    onError: () => {
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 3000);
    },
  });

  const updateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);

    try {
      await api.updateWebhookConfig({ webhook_url: webhookUrl });
      queryClient.invalidateQueries({ queryKey: ['webhook-config'] });
      setTestStatus('success');
    } catch {
      setTestStatus('error');
    } finally {
      setTesting(false);
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link2 className="w-6 h-6 text-primary-400" />
        <h1 className="text-2xl font-bold text-neutral-100">Webhook Configuration</h1>
      </div>

      <Card>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-neutral-100">Webhook URL</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={webhookUrl || ''}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-domain.com/api/webhooks/247pay"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <Button
                onClick={updateWebhook}
                disabled={testing}
                className="px-6 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              We will send POST requests to this URL when payment statuses change.
            </p>
          </div>
        </div>
      </Card>

      <Card className="bg-neutral-900/50 border border-neutral-800">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-lg bg-info-500/10 flex items-center justify-center text-info-400">
              <span className="text-xs font-bold text-info-500">I</span>
            </span>
            <h3 className="text-lg font-semibold text-neutral-100">Webhook Payload Example</h3>
          </div>
          <div className="bg-neutral-950 rounded-lg p-4 font-mono text-xs text-neutral-300 overflow-x-auto">
            <pre>{JSON.stringify(
              {
                event: 'payment.verified',
                payment_id: 'pay_abc123',
                order_id: 'ORD_2024_001',
                status: 'SUCCESS',
                amount: '100.00',
                currency: 'INR',
                upi_transaction_reference: '319283746501',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            )}</pre>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-neutral-100">Test Webhook</h3>
          </div>
          <Badge variant="info">Test</Badge>
          <p className="text-sm text-neutral-400 mb-4">
            Send a test webhook to your configured endpoint to verify delivery.
          </p>

          <div className="flex gap-3">
            <Button
              onClick={() => testWebhookMutation.mutate(webhookUrl || '')}
              disabled={testing}
              className="flex-1"
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Sending...
                </span>
              ) : (
                <span>Send Test Webhook</span>
              )}
            </Button>

            {testStatus === 'success' && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Test sent successfully!
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-center gap-2 text-rose-400 text-sm">
                <XCircle className="w-4 h-4" />
                Test failed
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
