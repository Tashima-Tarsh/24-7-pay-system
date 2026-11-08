import React from 'react';
import Link from 'next/link';
import { Button } from './Button';

interface HeaderProps {
  user?: { name: string; email: string } | null;
  onTestModeToggle?: () => void;
  isTestModeActive?: boolean;
  onCommandPalette: () => void;
}

export function Header({ user, onTestModeToggle, isTestModeActive, onCommandPalette }: HeaderProps) {
  const handleCreatePayment = () => {
    window.location.href = '/create-payment';
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">24</span>
          </div>
          <span className="font-semibold text-slate-900 text-sm">24/7 Pay</span>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-3 ml-8">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
          <span className="text-xs font-medium text-slate-500">Test Mode</span>
          <button
            className="relative inline-flex h-4 w-4 rounded-full bg-slate-600 after:absolute after:inset-0 after:rounded-full after:bg-white transition-colors duration-200"
            aria-label="Test mode toggle"
            onClick={() => onTestModeToggle?.()}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" className="hidden md:flex whitespace-nowrap" onClick={handleCreatePayment}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          Create payment
        </Button>

        <Button variant="secondary" size="sm" onClick={onCommandPalette} className="px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l5-5m-5 5l5-5M3 3l9 9" /></svg>
          <span className="hidden sm:inline text-slate-500 text-sm">Command</span>
          <kbd className="ml-1 px-1.5 py-0.5 text-xs bg-slate-200 rounded">⌘K</kbd>
        </Button>

        {user && (
          <div className="ml-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
