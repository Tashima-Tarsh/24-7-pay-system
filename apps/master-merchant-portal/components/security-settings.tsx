'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, RotateCcw, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { AuditTable } from '@/components/audit'
import { Empty, LoadState, PageHeading } from '@/components/shared'
import { Button, Input } from '@/components/ui/control'
import { Modal } from '@/components/ui/modal'
import { api, useApi } from '@/lib/client'
import type { AuditEntry, MerchantSettings } from '@/lib/types'

function lines(value: FormDataEntryValue | null) {
  return String(value || '').split(/[\n,]/).map((line) => line.trim()).filter(Boolean)
}

export function SecurityPage() {
  const settings = useApi<MerchantSettings>('settings')
  const audit = useApi<{ logs: AuditEntry[] }>('audit-log')
  const [busy, setBusy] = useState(false)
  const [rotate, setRotate] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [showPrefix, setShowPrefix] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const ipList = lines(fields.get('adminIps'))
    if (ipList.length === 0) {
      setError('Enter at least one administrator IP address.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('settings', { method: 'PATCH', body: JSON.stringify({
        adminIpWhitelist: ipList,
        webhookSourceIps: lines(fields.get('webhookIps')),
        appSignatures: lines(fields.get('appSignatures')),
        playerRateLimitPerMin: Number(fields.get('rateLimit')),
        enableGeoBlocking: fields.has('geoBlocking'),
      }) })
      toast.success('Security settings saved.')
      settings.refresh()
      audit.refresh()
    } catch (cause) {
      const message = (cause as Error).message
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function rotateKey() {
    setBusy(true)
    setError('')
    try {
      const response = await api<{ apiKey: string }>('auth/regenerate-key', { method: 'POST', body: JSON.stringify({ confirm: true }) })
      setNewKey(response.apiKey)
      toast.success('API key regenerated.')
      settings.refresh()
      audit.refresh()
    } catch (cause) {
      setError((cause as Error).message)
      toast.error((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const securityLogs = audit.data?.logs.filter((entry) => /fraud|blocked|mismatch|signature|fingerprint|denied/i.test(entry.action))
  const config = settings.data?.securityConfig

  return <article className="page">
    <PageHeading title="Security" detail="Manage who can administer the workspace and which app certificates can request payment sessions." />
    {!settings.data || !config ? <LoadState error={settings.error} retry={settings.refresh} /> : <>
      <section className="section">
        <h2>Merchant API key</h2>
        <div className="panel flex flex-wrap items-center justify-between gap-3">
          <div><p className="break-all font-mono text-sm">{showPrefix ? settings.data.apiKeyPrefix || 'Prefix unavailable' : 'sb_••••••••••••••••••••'}</p>
          <p className="description mt-1">The complete key appears once when issued.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowPrefix((value) => !value)}>{showPrefix ? 'Hide prefix' : 'Reveal prefix'}</Button>
            <Button variant="outline" onClick={() => { setError(''); setRotate(true) }}><RotateCcw size={16} /> Regenerate key</Button>
          </div>
        </div>
      </section>
      <section className="section">
        <div><h2>Access controls</h2><p className="description">Keep a current administrator IP address on the allowlist before saving.</p></div>
        <form className="grid max-w-3xl gap-4" onSubmit={save}>
          <label className="label">Administrator IP addresses<textarea name="adminIps" className="field" rows={3} defaultValue={config.adminIpWhitelist.join('\n')} required /><span className="description">One IP address per line.</span></label>
          <label className="label">Bank webhook source IP addresses<textarea name="webhookIps" className="field" rows={3} defaultValue={config.webhookSourceIps?.join('\n')} /><span className="description">One IP address or CIDR range per line. Your deployment also enforces its global provider allowlist.</span></label>
          <label className="label">Allowed app signing certificates<textarea name="appSignatures" className="field font-mono" rows={3} defaultValue={settings.data.appSignatures?.join('\n')} /><span className="description">One SHA-256 signing certificate fingerprint per line.</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Player requests per minute<Input name="rateLimit" type="number" min={1} defaultValue={config.playerRateLimitPerMin} required /></label>
            <label className="flex items-center gap-2 self-end rounded-md border border-outline px-3 py-3 text-sm"><input type="checkbox" name="geoBlocking" defaultChecked={config.enableGeoBlocking} /> Enable geographic controls</label>
          </div>
          {error && !rotate && <p className="error" role="alert">{error}</p>}
          <Button type="submit" className="justify-self-start" disabled={busy}><Shield size={16} /> Save access controls</Button>
        </form>
      </section>
    </>}
    <section className="section"><h2>Blocked devices and fraud events</h2>
      {securityLogs ? securityLogs.length ? <AuditTable logs={securityLogs} /> : <Empty>No blocked-device or fraud events have been recorded.</Empty> :
        <LoadState error={audit.error} retry={audit.refresh} />}
    </section>
    <Modal open={rotate} onOpenChange={(open) => { if (!busy) { setRotate(open); if (!open) { setNewKey(''); setError('') } } }}
      title={newKey ? 'Save the new API key' : 'Regenerate merchant API key?'}
      description={newKey ? 'The complete key is shown once.' : 'The current key will stop working immediately. Update your game server after regeneration.'}>
      {newKey ? <div className="grid gap-3">
        <p className="error">Save this now. It will never be shown again.</p>
        <Input readOnly value={newKey} aria-label="New merchant API key" className="font-mono" />
        <Button variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(newKey); toast.success('API key copied.') }
          catch { toast.error('Could not copy. Select and copy the key manually.') }
        }}><Copy size={16} /> Copy key</Button>
      </div> : <div className="grid gap-3">
        {error && <p className="error" role="alert">{error}</p>}
        <Button variant="danger" disabled={busy} onClick={() => void rotateKey()}>Regenerate key</Button>
      </div>}
    </Modal>
  </article>
}

export function SettingsPage() {
  const router = useRouter()
  const { data, error, refresh } = useApi<MerchantSettings>('settings')
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>, remove = false) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    const fields = new FormData(event.currentTarget)
    try {
      await api(remove ? 'settings' : 'settings/password', {
        method: remove ? 'DELETE' : 'POST',
        body: JSON.stringify(remove ? { password: fields.get('password') } : {
          currentPassword: fields.get('currentPassword'), newPassword: fields.get('newPassword'),
        }),
      })
      toast.success(remove ? 'Merchant account deleted.' : 'Password changed. Sign in again to continue.')
      router.replace('/login')
      router.refresh()
    } catch (cause) {
      setFormError((cause as Error).message)
      toast.error((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <article className="page">
    <PageHeading title="Settings" detail="Review your merchant profile or update your sign-in password." />
    {!data ? <LoadState error={error} retry={refresh} /> : <>
      <section className="section"><h2>Merchant profile</h2>
        <dl className="grid max-w-xl grid-cols-2 gap-4 rounded-lg border border-outline p-4">
          <div><dt className="text-sm text-muted">Game name</dt><dd className="mt-1 break-words">{data.gameName}</dd></div>
          <div><dt className="text-sm text-muted">Email address</dt><dd className="mt-1 break-words">{data.email}</dd></div>
        </dl>
      </section>
      <section className="section"><h2>Change password</h2>
        <form className="grid max-w-xl gap-4" onSubmit={(event) => void submit(event)}>
          <label className="label">Current password<Input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label className="label">New password<Input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label>
          {formError && !deleting && <p className="error" role="alert">{formError}</p>}
          <Button type="submit" className="justify-self-start" disabled={busy}>Change password</Button>
        </form>
      </section>
      <section className="section"><h2>Delete account</h2><p className="description">Remove portal access and stop accepting new payments for this merchant.</p>
        <Button variant="danger" className="justify-self-start" onClick={() => { setFormError(''); setDeleting(true) }}>Delete account</Button>
      </section>
      <Modal open={deleting} onOpenChange={(open) => { if (!busy) { setDeleting(open); if (!open) setFormError('') } }}
        title="Delete merchant account?" description="Enter your password to confirm account deletion.">
        <form className="grid gap-4" onSubmit={(event) => void submit(event, true)}>
          <label className="label">Current password<Input name="password" type="password" autoComplete="current-password" required /></label>
          {formError && <p className="error" role="alert">{formError}</p>}
          <Button variant="danger" type="submit" disabled={busy}>Delete merchant account</Button>
        </form>
      </Modal>
    </>}
  </article>
}
