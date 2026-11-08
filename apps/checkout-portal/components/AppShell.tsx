/**
 * AppShell Component — Phase 1: Auth + App Shell
 *
 * Main application shell with sidebar navigation.
 * Wraps all merchant console pages with consistent layout.
 */

import { useState } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { useAuth } from '../hooks/useAuth';

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  return (
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
          <Outlet />
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
