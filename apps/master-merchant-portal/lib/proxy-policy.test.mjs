import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canProxy, sameOrigin, proxyClientIp } from './proxy-policy.mjs'

test('proxy exposes only known merchant routes and methods', () => {
  assert.equal(canProxy(['upi', 'toggle', '6715e62467b9560c127d1f55'], 'PATCH'), true)
  assert.equal(canProxy(['upi', 'toggle', '6715e62467b9560c127d1f55'], 'POST'), false)
  assert.equal(canProxy(['upi', 'toggle', '../next'], 'PATCH'), false)
  assert.equal(canProxy(['upi', 'next'], 'GET'), false)
  assert.equal(canProxy(['webhook', 'bank'], 'POST'), false)
})

test('mutations require the configured portal origin', () => {
  assert.equal(sameOrigin('https://portal.test', 'https://portal.test'), true)
  assert.equal(sameOrigin('https://portal.test.attacker.test', 'https://portal.test'), false)
  assert.equal(sameOrigin(null, 'https://portal.test'), false)
})

test('only a single valid IP is forwarded from a trusted ingress header', () => {
  assert.equal(proxyClientIp('192.0.2.1'), '192.0.2.1')
  assert.equal(proxyClientIp('2001:db8::1'), '2001:db8::1')
  assert.equal(proxyClientIp('192.0.2.1, 192.0.2.2'), null)
})
