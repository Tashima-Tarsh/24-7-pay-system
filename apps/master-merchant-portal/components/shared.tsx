import { ArrowUpRight, Command } from 'lucide-react'

export function Mark() {
  return <div className="flex min-w-fit items-center gap-2.5">
    <span className="grid size-8 place-items-center rounded-md bg-brand text-white"><Command size={16} aria-hidden /></span>
    <span className="text-[15px] font-semibold tracking-tight">24/7 Pay<span className="ml-0.5 text-indigo-300">.</span></span>
  </div>
}

export function PageHeading({ title, detail, children }: {
  title: string
  detail: string
  children?: React.ReactNode
}) {
  return <header className="flex flex-wrap items-end justify-between gap-4">
    <div className="page-heading"><h1>{title}</h1><p className="description">{detail}</p></div>
    {children}
  </header>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="panel text-sm text-muted">{children}</p>
}

export function LoadState({ error, retry }: { error?: string; retry?: () => void }) {
  if (error) return <div className="error flex flex-wrap items-center justify-between gap-3" role="alert">
    <span>{error}</span>
    {retry && <button type="button" onClick={retry} className="rounded underline underline-offset-4">Try again</button>}
  </div>
  return <div className="grid gap-3" aria-busy="true" aria-label="Loading data">
    <div className="skeleton h-16" />
    <div className="skeleton h-48" />
  </div>
}

export function ExternalIcon() {
  return <ArrowUpRight size={14} aria-hidden />
}
