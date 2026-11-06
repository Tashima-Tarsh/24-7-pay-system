import { isIP } from 'node:net'

const allowed = new Map([
  ['auth/login', ['POST']],
  ['auth/register', ['POST']],
  ['auth/regenerate-key', ['POST']],
  ['upi/list', ['GET']],
  ['upi/add', ['POST']],
  ['upi/bulk-add', ['POST']],
  ['upi/emergency-kill', ['POST']],
  ['dashboard/stats', ['GET']],
  ['dashboard/recent-txns', ['GET']],
  ['dashboard/throttle', ['GET']],
  ['audit-log', ['GET']],
  ['settings', ['GET', 'PATCH', 'DELETE']],
  ['settings/password', ['POST']],
])

export function canProxy(segments, method) {
  const path = segments.join('/')
  if (allowed.get(path)?.includes(method)) return true
  if (segments.length !== 3 || !/^[a-z0-9_-]{1,100}$/i.test(segments[2])) return false
  return segments[0] === 'upi' && (
    (segments[1] === 'toggle' && method === 'PATCH') ||
    (segments[1] === 'delete' && method === 'DELETE')
  )
}

export function sameOrigin(origin, expected) {
  return typeof origin === 'string' && origin === expected
}

export function proxyClientIp(value) {
  return typeof value === 'string' && isIP(value) ? value : null
}
