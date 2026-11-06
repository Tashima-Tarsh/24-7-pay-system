import { NextRequest, NextResponse } from 'next/server'
import { canProxy, proxyClientIp, sameOrigin } from '@/lib/proxy-policy.mjs'

export const dynamic = 'force-dynamic'
const COOKIE = 'sanbookpay_session'
const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY_BYTES = 1024 * 1024

function json(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: NO_STORE })
}

function sessionCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.SESSION_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  })
}

async function handle(request: NextRequest, { params }: { params: { segments: string[] } }) {
  const { segments } = params
  const method = request.method
  const path = segments.join('/')
  const logout = path === 'auth/logout' && method === 'POST'
  if (!logout && !canProxy(segments, method)) return json({ error: 'Unknown merchant endpoint.' }, 404)
  if (method !== 'GET' && !sameOrigin(request.headers.get('origin'), process.env.PORTAL_ORIGIN || request.nextUrl.origin)) {
    return json({ error: 'The request origin is invalid.' }, 403)
  }
  if (logout) {
    const response = json({ ok: true }, 200)
    sessionCookie(response, '', 0)
    return response
  }

  const auth = path === 'auth/login' || path === 'auth/register'
  const changesPassword = path === 'settings/password'
  const deletesAccount = method === 'DELETE' && path === 'settings'
  const token = request.cookies.get(COOKIE)?.value
  if (!auth && !token) return json({ error: 'Sign in to continue.' }, 401)
  const headers = new Headers({ Accept: 'application/json' })
  if (!auth && token) headers.set('Authorization', `Bearer ${token}`)
  const trustedHeader = process.env.PORTAL_TRUSTED_CLIENT_IP_HEADER
  if (trustedHeader) {
    const address = proxyClientIp(request.headers.get(trustedHeader))
    if (address) headers.set('X-Forwarded-For', address)
  }

  let body: string | undefined
  if (method !== 'GET') {
    if (request.body && !request.headers.get('content-type')?.startsWith('application/json')) {
      return json({ error: 'Expected a JSON request.' }, 415)
    }
    const reader = request.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      let bytes = 0
      body = ''
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel()
          return json({ error: 'This upload is too large.' }, 413)
        }
        body += decoder.decode(chunk.value, { stream: true })
      }
      body += decoder.decode()
    }
    headers.set('Content-Type', 'application/json')
  }

  try {
    const base = process.env.API_INTERNAL_URL || 'http://localhost:3000'
    const upstream = await fetch(new URL(`/api/${path}${request.nextUrl.search}`, base), {
      method, body, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
    })
    const payload = await upstream.json().catch(() => ({}))
    if (upstream.status === 204) {
      const response = new NextResponse(null, { status: 204, headers: NO_STORE })
      if (changesPassword || deletesAccount) sessionCookie(response, '', 0)
      return response
    }
    if (upstream.ok && (auth || path === 'auth/regenerate-key')) {
      if (typeof payload.token !== 'string') return json({ error: 'The API did not create a session.' }, 502)
      const result = path === 'auth/login' ? { ok: true } : { apiKey: payload.apiKey }
      if ('apiKey' in result && typeof result.apiKey !== 'string') return json({ error: 'The API did not issue a key.' }, 502)
      const response = json(result, upstream.status)
      sessionCookie(response, payload.token, 3600)
      return response
    }
    // Invalid password confirmation is distinct from an expired session.
    if (upstream.status === 401 && (changesPassword || deletesAccount) && payload.error === 'Invalid password') {
      return json(payload, 422)
    }
    const response = json(payload, upstream.status)
    if (!auth && (upstream.status === 401 || (upstream.ok && (changesPassword || deletesAccount)))) {
      sessionCookie(response, '', 0)
    }
    const retryAfter = upstream.headers.get('retry-after')
    if (retryAfter) response.headers.set('Retry-After', retryAfter)
    return response
  } catch {
    return json({ error: 'The payment API is unavailable. Try again shortly.' }, 502)
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE }
