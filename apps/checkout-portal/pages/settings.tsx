/**
 * Settings Page — Phase 7: Settings
 *
 * Brand profile and receiving UPI configuration.
 */

'use client';

import { useState } from 'react';
import { Card, Button, Badge, Input } from '@youpi/ui';
import { api } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { User, Link2, CheckCircle, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const [form, setForm] = useState({
    business_name: '',
    business_email: '',
    business_phone: '',
    upi_id: '',
    webhook_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.put('/api/v1/merchant/settings', {
        business_name: form.business_name,
        business_email: form.business_email,
        business_phone: form.business_phone,
        upi_id: form.upi_id,
        webhook_url: form.webhook_url,
      });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
      toast.success('Settings saved');
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <User className="w-5 h-5 text-primary-400" />
        <h2 className="text-2xl font-bold text-neutral-100">Settings</h2>
      </div>

      <Card>
        <div className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
            <User className="w-5 h-5 text-primary-400" />
            Business Profile
          </h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-neutral-400">Business Name</label>
                <Input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="Sanbook Pay Store"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-neutral-400">Email</label>
                <Input
                  type="email"
                  value={form.business_email}
                  onChange={(e) => setForm({ ...form, business_email: e.target.value })}
                  placeholder="support@sanbookpay.com"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-neutral-400">Phone</label>
                <Input
                  type="tel"
                  value={form.business_phone}
                  onChange={(e) => setForm({ ...form, business_phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-2 mb-6">
            <Link2 className="w-5 h-5 text-primary-400" />
            <h3 className="text-lg font-semibold text-neutral-100">Receiving UPI ID</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.upi_id}
                onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
                placeholder="merchant@upi"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(form.upi_id);
                  toast.success('UPI ID copied to clipboard');
                }}
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-neutral-300 hover:bg-neutral-700"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Customers will send payments to this UPI ID.
            </p>
          </div>
        </div>
      </Card>

      <Button
        type="submit"
        className="w-full py-3"
        loading={loading}
        disabled={loading}
        onClick={handleSubmit}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            Saving...
          </span>
        ) : status === 'success' ? (
          <span className="flex items-center gap-2 text-green-500">
            <CheckCircle className="w-4 h-4" />
            Saved!
          </span>
        ) : status === 'error' ? (
          <span className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-4 h-4" />
            Save failed
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Save Changes
          </span>
        )}
      </Button>
    </div>
  );
}
