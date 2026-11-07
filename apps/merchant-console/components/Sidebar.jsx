import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LayoutDashboard,
  CreditCard,
  Code,
  Settings,
  LogOut,
  ShieldCheck,
  Activity,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/transactions', icon: CreditCard },
  { name: 'Developers', href: '/developers', icon: Code },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const router = useRouter();

  return (
    <div className="flex flex-col h-screen w-64 bg-slate-950 border-r border-white/10 text-slate-300 shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          24/7 Pay
        </h1>
        <p className="text-xs text-slate-500 mt-1">Merchant Console</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = router.pathname === item.href;
          return (
            <Link key={item.href} href={item.href} passHref>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'hover:bg-white/5 hover:text-white'
              }`}>
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          onClick={() => {
            localStorage.removeItem('token');
            router.push('/login');
          }}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
