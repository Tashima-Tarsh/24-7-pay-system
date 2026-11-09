import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { AuthLayout } from '../components/layout';
import { Card } from '../components';
import { Button, Input } from '../components';
import { storeAuth, clearAuth } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState('');
  const [merchantKey, setMerchantKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Validate credentials against backend
      const res = await fetch('http://127.0.0.1:6100/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Merchant-Id': merchantId, 'X-Merchant-Key': merchantKey },
      });

      if (res.ok) {
        storeAuth(merchantId, merchantKey);
        router.push('/');
      } else {
        setError('Invalid merchant ID or API key');
      }
    } catch (err) {
      // No fallback: backend authentication is required
      setError('Authentication service unavailable. Please try again.');
      return;
    }
  };

  return (
    <AuthLayout>
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">24</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="text-slate-600">Sign in to your merchant console</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Merchant ID"
            placeholder="Enter your merchant ID"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
          />
          <Input
            label="API Key"
            type="password"
            placeholder="Enter your API key"
            value={merchantKey}
            onChange={(e) => setMerchantKey(e.target.value)}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" variant="primary" className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don't have credentials? Contact your administrator.
        </p>
      </div>
    </AuthLayout>
  );
}
