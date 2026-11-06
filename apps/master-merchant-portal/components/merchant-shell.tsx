'use client'

import { Activity, BookOpen, ChevronRight, KeyRound, LayoutDashboard, ListChecks, LogOut, Settings, Wallet } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Mark } from '@/components/shared'
import { api } from '@/lib/client'
import { cn } from '@/lib/utils'

const groups = [
  { name: 'Payments', links: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/upi-ids', label: 'UPI routes', icon: Wallet },
    { href: '/ai-throttle', label: 'Route health', icon: Activity },
  ] },
  { name: 'Workspace', links: [
    { href: '/security', label: 'Security', icon: KeyRound },
    { href: '/audit-log', label: 'Audit log', icon: ListChecks },
    { href: '/docs', label: 'Integration docs', icon: BookOpen },
    { href: '/settings', label: 'Settings', icon: Settings },
  ] },
]

export function MerchantShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const title = groups.flatMap((group) => group.links).find((link) => link.href === path)?.label

  async function logout() {
    setBusy(true)
    try {
      await api('auth/logout', { method: 'POST' })
      toast.success('Signed out.')
      router.replace('/login')
      router.refresh()
    } catch (cause) {
      toast.error((cause as Error).message)
      setBusy(false)
    }
  }

  return <div className="min-h-dvh lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
    <aside className="sticky top-0 z-30 border-b border-outline bg-[#151620] lg:h-dvh lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
        <Link href="/dashboard" className="rounded" aria-label="24/7 Pay dashboard"><Mark /></Link>
        <button className="rounded p-2 text-muted hover:text-ink lg:hidden" onClick={logout} disabled={busy} aria-label="Sign out"><LogOut size={18} /></button>
      </div>
      <nav aria-label="Merchant navigation" className="flex items-center gap-1 overflow-x-auto px-3 pb-2 lg:grid lg:gap-5 lg:px-3 lg:pt-3">
        {groups.map((group) => <div key={group.name} className="contents lg:block">
          <p className="hidden px-2.5 pb-1.5 text-xs font-semibold text-muted lg:block">{group.name}</p>
          {group.links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}
            className={cn('flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted hover:bg-panel hover:text-ink', path === href && 'bg-indigo-950 text-indigo-200')}>
            <Icon size={16} aria-hidden /><span className="whitespace-nowrap">{label}</span>
          </Link>)}
        </div>)}
      </nav>
      <div className="absolute inset-x-3 bottom-4 hidden border-t border-outline pt-3 lg:block">
        <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted hover:bg-panel hover:text-ink" onClick={logout} disabled={busy}><LogOut size={16} /> Sign out</button>
      </div>
    </aside>
    <div className="min-w-0">
      <div className="hidden items-center gap-2 border-b border-outline px-10 py-3 text-xs text-muted lg:flex">
        Merchant workspace <ChevronRight size={13} aria-hidden /> <span className="text-ink">{title}</span>
      </div>
      <main id="main">{children}</main>
    </div>
  </div>
}
