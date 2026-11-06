import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const mock = createServer((request, response) => {
  const json = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(data))
  }
  if (request.url === '/api/auth/login') return json(200, { token: 'mock-token-initial' })
  if (request.url === '/api/auth/regenerate-key' && request.headers.authorization === 'Bearer mock-token-initial') {
    return json(200, { token: 'mock-token-replacement', apiKey: 'mock-key-just-issued' })
  }
  if (request.headers.authorization !== 'Bearer mock-token-replacement') return json(401, { error: 'Invalid session' })
  if (request.url === '/api/settings/password') {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      if (JSON.parse(body).currentPassword !== 'test-password-accepted') return json(401, { error: 'Invalid password' })
      response.writeHead(204).end()
    })
    return
  }
  json(200, { routes: [] })
})

mock.listen(0, '127.0.0.1')
await once(mock, 'listening')
const freePort = createServer()
freePort.listen(0, '127.0.0.1')
await once(freePort, 'listening')
const port = freePort.address().port
await new Promise((resolve) => freePort.close(resolve))
const origin = `http://127.0.0.1:${port}`
const portal = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
  env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${mock.address().port}`, PORTAL_ORIGIN: origin, SESSION_COOKIE_SECURE: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
portal.stdout.on('data', (chunk) => { output += chunk })
portal.stderr.on('data', (chunk) => { output += chunk })

try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (portal.exitCode !== null) break
    try { ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1_000) })).ok } catch {}
    if (ready) break
    await sleep(200)
  }
  assert.ok(ready, `Portal startup failed.\n${output}`)
  const direct = await fetch(`${origin}/dashboard`, { redirect: 'manual' })
  assert.equal(direct.status, 307)
  assert.equal(new URL(direct.headers.get('location')).pathname, '/login')

  const send = (path, body, cookie, requestOrigin = origin) => fetch(`${origin}/api/backend/${path}`, {
    method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body),
  })
  const rejected = await send('auth/login', {}, null, 'https://other.example')
  assert.equal(rejected.status, 403)

  const signedIn = await send('auth/login', { email: 'merchant@example.test', password: 'test-password-accepted' })
  assert.deepEqual(await signedIn.json(), { ok: true })
  const cookieHeader = signedIn.headers.get('set-cookie')
  assert.match(cookieHeader, /HttpOnly/i)
  assert.match(cookieHeader, /Secure/i)
  assert.match(cookieHeader, /SameSite=strict/i)
  const initial = cookieHeader.split(';')[0]
  const rotated = await send('auth/regenerate-key', { confirm: true }, initial)
  assert.deepEqual(await rotated.json(), { apiKey: 'mock-key-just-issued' })
  const replacement = rotated.headers.get('set-cookie').split(';')[0]
  assert.equal(replacement, 'sanbookpay_session=mock-token-replacement')

  const wrongPassword = await send('settings/password', { currentPassword: 'incorrect' }, replacement)
  assert.equal(wrongPassword.status, 422)
  assert.equal(wrongPassword.headers.get('set-cookie'), null)
  const changed = await send('settings/password', { currentPassword: 'test-password-accepted', newPassword: 'replacement-password' }, replacement)
  assert.equal(changed.status, 204)
  assert.match(changed.headers.get('set-cookie'), /Max-Age=0/i)
  console.log('Portal smoke test passed: protected pages, CSRF rejection, cookie-only JWT, key rotation and password reset.')
} finally {
  portal.kill()
  mock.closeAllConnections()
  await new Promise((resolve) => mock.close(resolve))
}
