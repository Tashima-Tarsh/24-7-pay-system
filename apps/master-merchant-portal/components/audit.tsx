'use client'

import { useMemo, useState } from 'react'
import { Empty, LoadState, PageHeading } from '@/components/shared'
import { Input } from '@/components/ui/control'
import { localTime, useApi } from '@/lib/client'
import type { AuditEntry } from '@/lib/types'

export function AuditTable({ logs }: { logs: AuditEntry[] }) {
  if (!logs.length) return <Empty>No audit events match this view.</Empty>
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="Audit events">
    <table className="table"><thead><tr>{['Timestamp', 'Action', 'IP address', 'User agent', 'Details'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
      <tbody>{logs.map((entry, index) => <tr key={entry.id || entry._id || `${entry.timestamp}-${index}`}>
        <td className="whitespace-nowrap text-muted"><time dateTime={entry.timestamp}>{localTime(entry.timestamp)}</time></td>
        <td className="font-medium">{entry.action}</td><td className="font-mono text-xs">{entry.ip || '—'}</td>
        <td><span className="block max-w-52 truncate" title={entry.userAgent}>{entry.userAgent || '—'}</span></td>
        <td>{entry.details && Object.keys(entry.details).length ? <details className="min-w-32">
          <summary className="cursor-pointer text-indigo-200">View details</summary>
          <pre className="mt-2 max-w-72 overflow-auto text-xs text-muted">{JSON.stringify(entry.details, null, 2)}</pre>
        </details> : '—'}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function AuditPage() {
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const params = new URLSearchParams({ limit: '200' })
  if (action) params.set('action', action)
  if (from) params.set('from', from)
  if (until) params.set('to', until)
  const { data, error, refresh } = useApi<{ logs: AuditEntry[] }>(`audit-log?${params}`)
  const { data: recent } = useApi<{ logs: AuditEntry[] }>('audit-log?limit=200')
  const actions = useMemo(() => [...new Set(recent?.logs.map((entry) => entry.action))].sort(), [recent])

  return <article className="page">
    <PageHeading title="Audit log" detail="Review the recorded administrative and security events for this workspace." />
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="label">Action<select className="field" value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option>{actions.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="label">From date<Input type="date" value={from} max={until || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="label">Through date<Input type="date" value={until} min={from || undefined} onChange={(event) => setUntil(event.target.value)} /></label>
    </div>
    <p className="description">Showing up to 200 matching events. Date filters use UTC.</p>
    {!error && data ? <AuditTable logs={data.logs} /> : <LoadState error={error} retry={refresh} />}
  </article>
}
