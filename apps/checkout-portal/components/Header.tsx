/**
 * Header Component — Phase 1: Auth + App Shell
 *
 * Top navigation bar with user profile, test mode toggle, and commands.
 */

import { Command } from 'lucide-react';
import { Button } from '@24-7-pay/ui';

interface HeaderProps {
  user: any;
  onTestModeToggle: (enabled: boolean) => void;
  isTestModeActive: boolean;
  onCommandPalette: () => void;
}

export function Header({ user, onCommandPalette }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-900/50 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: Brand */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">24</span>
            </div>
            <span className="font-semibold text-neutral-100 text-sm">24/7 Pay</span>
          </div>
        </div>

        {/* Center: Test Mode Toggle */}
        <div className="flex items-center gap-3 ml-8 hidden md:flex">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-xs font-medium text-neutral-300">Test Mode</span>
            <button
              className="relative inline-flex h-4 w-4 rounded-full bg-neutral-600 after:absolute after:inset-0 after:rounded-full after:bg-white transition-colors duration-200"
              aria-label="Test mode toggle"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <Button
            onClick={onCommandPalette}
            variant="ghost"
            className="px-3 py-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Command palette"
          >
            <Command className="w-4 h-4" />
            <span className="hidden sm:inline text-neutral-400 text-sm">Command</span>
            <kbd className="ml-1 px-1.5 py-0.5 text-xs bg-neutral-800 rounded">⌘K</kbd>
          </button>

          <div className="ml-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-neutral-100">{user.name}</p>
                <p className="text-xs text-neutral-500">{user.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
