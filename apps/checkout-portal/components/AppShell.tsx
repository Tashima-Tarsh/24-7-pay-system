/**
 * AppShell Component — Phase 1: Auth + App Shell
 *
 * Main application shell with sidebar navigation.
 * Wraps all merchant console pages with consistent layout.
 * Uses Next.js native routing (next/link, next/router) so navigation
   works without a separate RouterProvider.
 */

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { Toast } from './Toast';
import { ToastProvider } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { user } = useAuth();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main content area */}
        <div className="flex flex-col h-full">
          <Header
            user={user}
            onCommandPalette={() => setCommandPaletteOpen(true)}
          />

          <main className="flex-1 overflow-y-auto p-8 transition-all duration-300">
            {children}
          </main>
        </div>

        {/* Command Palette */}
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />

        <Toast />
      </div>
    </ToastProvider>
  );
}
