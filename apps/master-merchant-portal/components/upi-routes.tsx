'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Papa from 'papaparse'
import { FileUp, Plus, Power, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Empty, LoadState, PageHeading } from '@/components/shared'
import { Button, Badge, Input } from '@/components/ui/control'
import { Modal } from '@/components/ui/modal'
import { api, localTime, useApi } from '@/lib/client'
import { scoreTone, upiId, type UpiRoute } from '@/lib/types'

type DialogState = 'add' | 'import' | 'kill' | UpiRoute | null
type CsvRow = { upiId: string; name: string; type: string }

export function UpiRoutes() {
  const { data, error, refresh } = useApi<{ upiIds: UpiRoute[] }>('upi/list')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [pending, setPending] = useState('')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<CsvRow[]>([])
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('add')) setDialog('add')
  }, [])

  function open(next: DialogState) {
    setDialog(next)
    setCsv('')
    setPreview([])
    setFormError('')
  }

  async function mutate(path: string, method: string, success: string, body?: object) {
    setPending(path)
    setFormError('')
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined })
      toast.success(success)
      refresh()
      open(null)
    } catch (cause) {
      const message = (cause as Error).message
      toast.error(message)
      setFormError(message)
    } finally {
      setPending('')
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const limit = fields.get('dailyLimit')
    void mutate('upi/add', 'POST', 'UPI route added.', {
      upiId: fields.get('upiId'), name: fields.get('name'), type: 'merchant',
      ...(limit && { dailyLimit: Number(limit) }),
    })
  }

  async function previewFile(file?: File) {
    setCsv('')
    setPreview([])
    setFormError('')
    if (!file) return
    if (file.size > 64_000) { setFormError('Choose a CSV file smaller than 64 KB.'); return }
    try {
      const source = await file.text()
      const parsed = Papa.parse<CsvRow>(source, { header: true, skipEmptyLines: 'greedy' })
      if (parsed.errors.length || !parsed.data.length || !['upiId', 'name'].every((field) => parsed.meta.fields?.includes(field))) {
        setFormError('Use a CSV with upiId and name columns and at least one row.')
        return
      }
      if (parsed.data.length > 100 || parsed.data.some((row) => row.type && row.type.trim() !== 'merchant')) {
        setFormError('Import up to 100 routes at a time. Use merchant for the optional type column.')
        return
      }
      setCsv(source)
      setPreview(parsed.data)
      toast.success(`${parsed.data.length} rows ready for review.`)
    } catch {
      setFormError('Could not read the selected CSV file.')
    }
  }

  const target = typeof dialog === 'object' && dialog !== null ? dialog : undefined
  const count = data?.upiIds.filter((route) => route.isActive).length ?? 0

  return <article className="page">
    <PageHeading title="UPI routes" detail="Manage receiving VPAs and review their availability before sending traffic.">
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => open('import')}><FileUp size={16} /> Import CSV</Button><Button onClick={() => open('add')}><Plus size={16} /> Add UPI route</Button></div>
    </PageHeading>
    {!data ? <LoadState error={error} retry={refresh} /> : data.upiIds.length === 0 ? <Empty>There are no receiving routes yet. Add a merchant VPA to get started.</Empty> : <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2>Receiving pool</h2><span className="text-sm tabular-nums text-muted">{count} active / {data.upiIds.length} routes</span></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="UPI receiving routes">
        <table className="table"><thead><tr>{['UPI ID', 'Name', 'Type', 'Bank', 'Health', 'Daily usage', 'Last used', 'Actions'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
          <tbody>{data.upiIds.map((route) => <tr key={upiId(route)}>
            <td className="font-medium">{route.upiId}</td><td>{route.name}</td><td><Badge>{route.type}</Badge></td><td>{route.bank}</td>
            <td><Badge tone={scoreTone(route.healthScore)}>{route.healthScore} / 100</Badge></td><td className="whitespace-nowrap">{route.usageCount} / {route.dailyLimit}</td>
            <td className="whitespace-nowrap text-muted">{localTime(route.lastUsed)}</td>
            <td><div className="flex gap-2">
              <Button variant="outline" className="min-h-8 px-2.5 py-1" disabled={!!pending} onClick={() => void mutate(`upi/toggle/${encodeURIComponent(upiId(route))}`, 'PATCH', route.isActive ? 'Route disabled.' : 'Route enabled.', { isActive: !route.isActive })}>{route.isActive ? 'Disable' : 'Enable'}</Button>
              <button type="button" className="rounded p-2 text-muted hover:text-red-200" onClick={() => open(route)} aria-label={`Delete ${route.upiId}`}><Trash2 size={16} /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
    <section className="section sm:flex sm:items-center sm:justify-between">
      <div><h2>Emergency controls</h2><p className="description">Pause new route assignments across your entire receiving pool.</p></div>
      <Button variant="danger" disabled={!count || !!pending} onClick={() => open('kill')}><Power size={16} /> Emergency kill switch</Button>
    </section>
    <Modal open={dialog === 'add'} onOpenChange={(value) => { if (!value && !pending) open(null) }} title="Add a UPI route" description="Enter the merchant VPA approved for your checkout.">
      <form className="grid gap-4" onSubmit={add}>
        <label className="label">UPI ID<Input name="upiId" placeholder="store@bank" pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,99}@[A-Za-z0-9][A-Za-z0-9.\-]{1,49}" maxLength={151} required /></label>
        <label className="label">Display name<Input name="name" maxLength={100} required /></label>
        <label className="label">Account type<Input value="Merchant" readOnly /></label>
        <p className="description">Intent-based payments require a merchant UPI ID.</p>
        <label className="label">Daily limit <Input type="number" name="dailyLimit" min={1} max={150} step={1} placeholder="Use the account-type default" /></label>
        {formError && <p className="error" role="alert">{formError}</p>}
        <Button type="submit" disabled={!!pending}>Add route</Button>
      </form>
    </Modal>
    <Modal open={dialog === 'import'} onOpenChange={(value) => { if (!value && !pending) open(null) }} title="Import UPI routes" description="Upload up to 100 rows with upiId and name columns. Optional columns are type and dailyLimit.">
      <div className="grid gap-4">
        <label className="label">CSV file<Input type="file" accept=".csv,text/csv" onChange={(event) => void previewFile(event.target.files?.[0])} disabled={!!pending} /></label>
        {preview.length > 0 && <div className="grid gap-2">
          <p className="text-sm text-muted">Showing {Math.min(5, preview.length)} of {preview.length} routes</p>
          <div className="table-wrap"><table className="table"><thead><tr><th>UPI ID</th><th>Name</th><th>Type</th></tr></thead><tbody>
            {preview.slice(0, 5).map((row, index) => <tr key={index}><td>{row.upiId}</td><td>{row.name}</td><td>{row.type || 'merchant'}</td></tr>)}
          </tbody></table></div>
        </div>}
        {formError && <p className="error" role="alert">{formError}</p>}
        <Button disabled={!csv || !!pending} onClick={() => void mutate('upi/bulk-add', 'POST', 'UPI routes imported.', { csv })}>Import {preview.length || ''} routes</Button>
      </div>
    </Modal>
    <Modal open={dialog === 'kill' || !!target} onOpenChange={(value) => { if (!value && !pending) open(null) }}
      title={target ? 'Delete UPI route?' : 'Disable all receiving routes?'}
      description={target ? `${target.upiId} will be removed from route selection.` : 'New payments will stop receiving assignments until routes are enabled again.'}>
      {formError && <p className="error mb-4" role="alert">{formError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={!!pending} onClick={() => open(null)}>Cancel</Button>
        <Button variant="danger" disabled={!!pending} onClick={() => void (target ?
          mutate(`upi/delete/${encodeURIComponent(upiId(target))}`, 'DELETE', 'Route removed.') :
          mutate('upi/emergency-kill', 'POST', 'All receiving routes disabled.', { confirm: true }))}>{target ? 'Delete route' : 'Disable all routes'}</Button>
      </div>
    </Modal>
  </article>
}
