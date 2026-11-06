'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Turnstile } from '@marsidev/react-turnstile'
import { ArrowRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input, buttonVariants } from '@/components/ui/control'
import { Mark } from '@/components/shared'
import { api } from '@/lib/client'

export function AuthForm({ registration, captchaKey }: { registration: boolean; captchaKey: string }) {
  const router = useRouter()
  const [key, setKey] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = registration ? 'Create your account' : 'Sign in to 24/7 Pay'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const body = {
        email: form.get('email'), password: form.get('password'),
        ...(registration && { gameName: form.get('gameName'), captchaToken }),
      }
      const response = await api<{ apiKey?: string }>(registration ? 'auth/register' : 'auth/login', {
        method: 'POST', body: JSON.stringify(body),
      })
      if (registration && response.apiKey) {
        setKey(response.apiKey)
        toast.success('Merchant account created.')
      } else {
        toast.success('Signed in.')
        router.replace('/dashboard')
        router.refresh()
      }
    } catch (cause) {
      const message = (cause as Error).message
      setError(message)
      toast.error(message)
      setCaptchaToken('')
      setCaptchaAttempt((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(key)
      toast.success('API key copied.')
    } catch {
      toast.error('Could not copy. Select and copy the key manually.')
    }
  }

  return <main id="main" className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_50%_0%,#292854_0%,#11121a_52%)] px-4 py-10">
    <div className="w-full max-w-md">
      <div className="mb-5 flex justify-center"><Mark /></div>
      <div className="rounded-xl border border-outline bg-panel px-6 py-7 sm:px-8">
        {key ? <div className="grid gap-4">
          <h1 className="text-2xl sm:text-3xl">Your merchant API key</h1>
          <p className="error">Save this now. It will never be shown again.</p>
          <p className="description">Store the key on your game server or in its secrets manager.</p>
          <Input readOnly value={key} aria-label="New merchant API key" className="font-mono" />
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={copyKey}><Copy size={16} /> Copy key</Button>
            <Button onClick={() => { setKey(''); router.replace('/dashboard'); router.refresh() }}>Go to dashboard <ArrowRight size={16} /></Button>
          </div>
        </div> : <>
          <h1 className="text-2xl sm:text-3xl">{heading}</h1>
          <p className="description mb-6 mt-2">{registration ? 'Set up a workspace to manage your game’s payments.' : 'Manage your receiving routes and see incoming payments.'}</p>
          <form className="grid gap-4" onSubmit={submit}>
            {registration && <label className="label">Game name<Input name="gameName" maxLength={100} required /></label>}
            <label className="label">Email address<Input type="email" name="email" autoComplete="email" maxLength={254} required /></label>
            <label className="label">Password<Input type="password" name="password" autoComplete={registration ? 'new-password' : 'current-password'} minLength={registration ? 12 : undefined} required /></label>
            {registration && (captchaKey ?
              <Turnstile key={captchaAttempt} siteKey={captchaKey} onSuccess={setCaptchaToken} onExpire={() => setCaptchaToken('')} onError={() => setCaptchaToken('')} options={{ theme: 'dark', size: 'flexible' }} /> :
              <p className="alert">Registration requires a CAPTCHA site key. Ask your administrator to configure it.</p>
            )}
            {error && <p role="alert" className="error">{error}</p>}
            <Button type="submit" disabled={busy || (registration && !captchaToken)}>
              {busy ? 'Please wait…' : registration ? 'Create account' : 'Sign in'} <ArrowRight size={16} />
            </Button>
          </form>
        </>}
      </div>
      {!key && <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
        {registration ? 'Already registered?' : 'New to 24/7 Pay?'}
        <Link href={registration ? '/login' : '/register'} className={buttonVariants({ variant: 'outline', className: 'min-h-8 px-2 py-1' })}>
          {registration ? 'Sign in' : 'Create account'}
        </Link>
      </div>}
    </div>
  </main>
}
