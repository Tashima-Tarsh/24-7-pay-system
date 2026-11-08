/**
 * MFA Challenge Page — Phase 1: Auth + App Shell
 *
 * Two-factor authentication verification page.
 * Shown after successful login when MFA is enabled for the merchant.
 */

'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Input } from '@24-7-pay/ui';
import { useAuth } from '../hooks/useAuth';
import { Shield, AlertCircle } from 'lucide-react';

export function MFAChallengePage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { verifyMFA } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await verifyMFA(code);
      navigate({ to: '/' });
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="w-6 h-6 text-primary-400" />
            <h1 className="text-2xl font-bold text-neutral-100">
              Two-Factor Authentication
            </h1>
          </div>
          <p className="text-neutral-400 text-sm">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="code" className="block text-sm font-medium text-neutral-300">
              Verification Code
            </label>
            <Input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              placeholder="000000"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
              autoFocus
            />
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
            Verify
          </Button>
        </form>
      </div>
    </div>
  );
}
