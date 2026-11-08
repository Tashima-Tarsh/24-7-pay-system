/**
 * Toast Component — renders active toast notifications.
 */

'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '../hooks/useToast';

export function Toast() {
  const { toasts } = useToast();

  useEffect(() => {
    const timers = toasts.map((t) =>
      setTimeout(() => {}, 3000)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [toasts]);

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
            ${t.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}
            shadow-lg animate-in fade-in slide-in-from-top-2
          `}
        >
          {t.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <span className="text-emerald-300">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
