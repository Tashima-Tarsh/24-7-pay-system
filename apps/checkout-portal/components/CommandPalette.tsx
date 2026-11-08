/**
 * CommandPalette Component — Phase 1: Auth + App Shell
 *
 * Command palette (Cmd+K) for quick navigation and actions.
 * Uses Radix Dialog for accessibility. Next.js native routing.
 */

'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@radix-ui/react-dialog';
import { Search, Webhook, FileText, Shield, Users, Settings, LayoutDashboard, CreditCard, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@youpi/ui';
import { useRouter } from 'next/router';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const commands = [
  { name: 'Overview', href: '/', shortcut: 'g o', icon: LayoutDashboard },
  { name: 'Payments', href: '/payments', shortcut: 'g p', icon: CreditCard },
  { name: 'VPA Pool', href: '/vpa-pool', shortcut: 'g v', icon: Wallet },
  { name: 'Quarantine', href: '/quarantine', shortcut: 'g q', icon: AlertTriangle },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Audit Log', href: '/audit', icon: Shield },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Create Payment Link', href: '/payments/new', action: 'create' },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredCommands = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogTrigger asChild>
        <button className="sr-only">Open command palette</button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-2xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 px-4 pb-4 border-b border-neutral-800">
          <Search className="w-5 h-5 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-neutral-100 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-neutral-500 text-sm">
              No results found
            </div>
          ) : (
            filteredCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => {
                  if (cmd.action === 'create') {
                    router.push('/payments/new');
                  } else {
                    router.push(cmd.href);
                  }
                  onClose();
                }}
                className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-neutral-800 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-neutral-100">{cmd.name}</span>
                  {cmd.shortcut && (
                    <kbd className="px-2 py-0.5 text-xs bg-neutral-800 text-neutral-400 rounded">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
                <span className="text-neutral-600 text-xs">{cmd.shortcut}</span>
              </button>
            )))}
          )
        </div>
      </DialogContent>
    </Dialog>
  );
}
