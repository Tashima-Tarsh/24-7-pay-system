'use client'

import { useCallback, useEffect, useState } from 'react'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api/backend/${path}`, { ...init, headers, cache: 'no-store' })
  if (response.status === 401 && !['auth/login', 'auth/register'].includes(path)) {
    window.location.replace('/login')
    throw new Error('Your session expired. Sign in to continue.')
  }
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error :
      typeof payload.message === 'string' ? payload.message : `Request failed (${response.status}).`
    const issue = Array.isArray(payload.fields) && payload.fields[0]
    throw new Error(issue?.field && typeof issue.message === 'string' ? `${issue.field}: ${issue.message}` : message)
  }
  return payload as T
}

export function useApi<T>(path: string, pollMs?: number) {
  const [state, setState] = useState<{ data?: T; error?: string }>({})
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const load = () => api<T>(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ data })
    }, (error: Error) => {
      if (!controller.signal.aborted) setState((previous) => ({ ...previous, error: error.message }))
    })
    void load()
    const interval = pollMs ? setInterval(load, pollMs) : undefined
    return () => {
      controller.abort()
      if (interval) clearInterval(interval)
    }
  }, [path, revision, pollMs])
  return { ...state, refresh }
}

export const rupees = (paise: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(paise / 100)

export function localTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
