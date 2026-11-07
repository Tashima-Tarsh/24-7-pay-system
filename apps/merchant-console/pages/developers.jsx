'use client'

import { useState } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  CheckCircle,
  Shield,
  Key,
  Link2,
  Send,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://dynamo-pay-d545.onrender.com';
const MERCHANT_ID = '00000000-0000-0000-000000000001';
const MERCHANT_KEY = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';

export default function DevelopersPage() {
  const [showKey, setShowKey] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://webhook.site/your-unique-id');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const testWebhook = async () => {
    setTestStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/api/v1/merchant/webhooks/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-merchant-id': MERCHANT_ID,
          'x-merchant-key': MERCHANT_KEY,
        },
        body: JSON.stringify({ callbackUrl: webhookUrl }),
      });

      if (res.ok) {
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        setTestStatus('error');
      }
    } catch (err) {
      setTestStatus('error');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-white">Developer Settings</h2>

      {/* API Credentials */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          API Credentials
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Merchant ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={MERCHANT_ID}
                readOnly
                className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 font-mono text-sm"
              />
              <button
                onClick={() => copyToClipboard(MERCHANT_ID)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Webhook Secret</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={MERCHANT_KEY}
                readOnly
                className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 font-mono text-sm"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => copyToClipboard(MERCHANT_KEY)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-400" />
          Webhook Configuration
        </h3>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Endpoint URL</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="https://your-domain.com/api/webhooks/247pay"
          />
          <p className="text-xs text-slate-500 mt-2">
            We will send POST requests to this URL when payment statuses change.
          </p>
        </div>

        <button
          onClick={testWebhook}
          disabled={testStatus === 'loading'}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
            testStatus === 'success'
              ? 'bg-emerald-600 text-white'
              : testStatus === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {testStatus === 'loading' && (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          )}
          {testStatus === 'success' && <CheckCircle className="w-4 h-4" />}
          {testStatus === 'idle' && 'Send Test Webhook'}
          {testStatus === 'loading' && 'Sending...'}
          {testStatus === 'success' && 'Test Sent Successfully!'}
          {testStatus === 'error' && 'Failed to Send'}
        </button>

        <div className="bg-slate-900 border border-white/5 rounded-lg p-4 mt-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Webhook Payload Example
          </h4>
          <pre className="text-xs text-slate-300 font-mono overflow-x-auto bg-black/20 p-3 rounded">
            {JSON.stringify(
              {
                event: 'payment.status_changed',
                paymentId: 'pay_abc123',
                orderId: 'ORD_20240001',
                status: 'SUCCESS',
                amount: '100.00',
                currency: 'INR',
                upiTransactionReference: '319283746501',
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
