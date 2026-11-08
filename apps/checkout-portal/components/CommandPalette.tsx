'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { Button } from './Button';
import { useRouter } from 'next/router';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const commands = [
  { name: 'Overview', href: '/', shortcut: 'g o' },
  { name: 'Payments', href: '/payments', shortcut: 'g p' },
  { name: 'Create Payment', href: '/create-payment', shortcut: 'g c' },
  { name: 'VPA Pool', href: '/vpa-pool', shortcut: 'g v' },
  { name: 'Quarantine', href: '/quarantine', shortcut: 'g q' },
  { name: 'Webhooks', href: '/webhooks', shortcut: 'g w' },
  { name: 'Reports', href: '/reports', shortcut: 'g r' },
  { name: 'Audit Log', href: '/audit', shortcut: 'g a' },
  { name: 'Team', href: '/team', shortcut: 'g t' },
  { name: 'Settings', href: '/settings', shortcut: 'g s' },
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
      <DialogContent className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 px-4 pb-4 border-b border-slate-700">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-slate-100 focus:outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">
              No results found
            </div>
          ) : (
            <>
              {filteredCommands.map((cmd) => (
                <button
                  key={cmd.name}
                  onClick={() => {
                    router.push(cmd.href);
                    onClose();
                  }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-800 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-100">{cmd.name}</span>
                    <kbd className="px-2 py-0.5 text-xs bg-slate-800 text-slate-400 rounded">
                      {cmd.shortcut}
                    </kbd>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
