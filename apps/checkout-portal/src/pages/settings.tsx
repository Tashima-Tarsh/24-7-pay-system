import React, { useState } from 'react';
import { Card, Input, Button } from '../../components';

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [upiId, setUpiId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setMessage('Settings saved successfully!');
    } catch (err: any) {
      setMessage(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-600">Configure your merchant profile and receiving UPI</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.includes('successfully') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {message}
        </div>
      )}

      <Card className="h-full">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-slate-900">Business Profile</h3>
        </div>
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <Input
            label="Business Name"
            placeholder="e.g. Sanbook Pay Store"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <Input
            label="Business Email"
            type="email"
            placeholder="support@sanbookpay.com"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
          />
          <Input
            label="Business Phone"
            placeholder="+91 9876543210"
            value=""
            onChange={() => {}}
          />
          <hr className="border-slate-200 my-6" />

          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Receiving UPI ID</h3>
          <div className="space-y-3">
            <Input
              label="UPI ID"
              placeholder="merchant@upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Customers will send payments to this UPI ID.
            </p>
          </div>

          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Webhook URL</h3>
          <div className="space-y-3">
            <Input
              label="Webhook Endpoint"
              placeholder="https://your-domain.com/api/webhooks/247pay"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              We will send POST requests to this URL when payment statuses change.
            </p>
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
