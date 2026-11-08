/**
 * Login Page — Phase 1: Auth + App Shell
 *
 * Merchant login page with email/password authentication.
 * Redirects to MFA challenge if MFA is enabled for the merchant.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@youpi/ui';
import { Input } from '@youpi/ui';
import { useAuth } from '../hooks/useAuth';
import { Lock, Mail, AlertCircle, X, Eye } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await login(email, password);
      if (result.mfaRequired) {
        router.push('/mfa-challenge');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Lock className="w-6 h-6 text-primary-400" />
            <h1 className="text-3xl font-bold text-neutral-100">24/7 Pay</h1>
          </div>
          <p className="text-neutral-400 text-sm">
            Sign in to your merchant account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="merchant@example.com"
              required
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={password ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pr-10 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setPassword((p) => !p ? '' : p)}
                className="absolute right-3 top-1/2 -mt-2 text-neutral-500 hover:text-neutral-300"
              >
                {password ? <X className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            loading={loading}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
