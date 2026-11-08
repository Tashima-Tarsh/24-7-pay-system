'use client';

'use client';

import React, { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { Toast } from './Toast';
import { ToastProvider } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { user } = useAuth();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div className="flex flex-col h-full">
          <Header
            user={user}
            onTestModeToggle={() => {}}
            isTestModeActive={false}
            onCommandPalette={() => setCommandPaletteOpen(true)}
          />
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />
        <Toast />
      </div>
    </ToastProvider>
  );
}
