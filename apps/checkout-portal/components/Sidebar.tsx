/**
 * Sidebar Component — Phase 1: Auth + App Shell
 *
 * Persistent sidebar navigation for the merchant console.
 * Supports collapsed state for compact navigation.
 * Uses Next.js native routing (next/link, next/router) so links navigate.
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '@youpi/ui/utils';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  CreditCard,
  Wallet,
  Shield,
  Webhook,
  FileText,
  Users,
  Settings,
  AlertTriangle,
  ChevronRight,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Payments', href: '/payments', icon: CreditCard },
  { name: 'VPA Pool', href: '/vpa-pool', icon: Wallet },
  { name: 'Quarantine', href: '/quarantine', icon: AlertTriangle, badge: 3 },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Audit Log', href: '/audit', icon: Shield },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const router = useRouter();
  const { logoutAndRedirect } = useAuth();

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-neutral-950 border-r border-white/10 text-slate-300 shrink-0 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[280px]'
      )}
    >
      {/* Logo */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">24</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-neutral-100 text-sm">24/7 Pay</span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5 rotate-180" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = router.pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <a
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30'
                    : 'hover:bg-neutral-800 hover:text-neutral-100'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <span className="flex-1">{item.name}</span>
                )}
                {item.badge && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-danger-500/10 text-danger-500 rounded-full">
                    {item.badge}
                  </span>
                )}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={logoutAndRedirect}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && (
            <span className="flex-1">Sign Out</span>
          )}
        </button>
      </div>
    </aside>
  );
}
