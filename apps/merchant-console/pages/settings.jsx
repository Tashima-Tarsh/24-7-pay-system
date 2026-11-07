'use client'

import { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Link2,
  Save,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://dynamo-pay-d545.onrender.com';
const MERCHANT_ID = '00000000-0000-0000-000000000001';
const MERCHANT_KEY = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState('Sanbook Pay Store');
  const [businessEmail, setBusinessEmail] = useState('support@sanbookpay.com');
  const [businessPhone, setBusinessPhone] = useState('9876543210');
  const [upiId, setUpiId] = useState('9082843142@slc');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/api/v1/merchant/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-merchant-id': MERCHANT_ID,
          'x-merchant-key': MERCHANT_KEY,
        },
        body: JSON.stringify({
          businessName,
          businessEmail,
          businessPhone,
          upiId,
          webhookUrl,
        }),
      });

      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      {/* Business Profile */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-400" />
          Business Profile
        </h3>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-400">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-400">Email</label>
              <input
                type="email"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-400">Phone</label>
              <input
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Receiving UPI Configuration */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-400" />
          Receiving UPI ID
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">UPI ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(upiId);
                  alert('UPI ID copied to clipboard!');
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              This is the UPI ID where customer payments will be received.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-400" />
          Webhook Configuration
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Callback URL</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              placeholder="https://your-domain.com/api/webhooks/247pay"
            />
            <p className="text-xs text-slate-500 mt-2">
              We will send POST requests to this URL when payment statuses change.
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saveStatus === 'loading'}
        className={`w-full rounded-xl px-6 py-3.5 text-white font-semibold transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none ${
          saveStatus === 'success'
            ? 'bg-emerald-600'
            : saveStatus === 'error'
              ? 'bg-red-600'
              : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700'
        }`}
      >
        {saveStatus === 'loading' && (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        )}
        {saveStatus === 'success' && <CheckCircle className="w-4 h-4 mr-2" />}
        {saveStatus === 'error' && <AlertCircle className="w-4 h-4 mr-2" />}
        {saveStatus === 'success' && 'Saved Successfully!'}
        {saveStatus === 'error' && 'Save Failed'}
        {saveStatus === 'idle' && 'Save Changes'}
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
