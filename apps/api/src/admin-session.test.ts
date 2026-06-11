import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from './admin-session.js'

test('creates and verifies an admin session token', () => {
  const token = createAdminSessionToken({
    userId: 'admin_demo',
    secret: 'test-secret',
    now: 1_800_000_000_000,
    ttlSeconds: 60,
  })

  const session = verifyAdminSessionToken(token, {
    secret: 'test-secret',
    now: 1_800_000_001_000,
  })

  assert.deepEqual(session, {
    role: 'admin',
    userId: 'admin_demo',
    expiresAt: 1_800_000_060_000,
  })
})

test('rejects expired or tampered admin session tokens', () => {
  const token = createAdminSessionToken({
    userId: 'admin_demo',
    secret: 'test-secret',
    now: 1_800_000_000_000,
    ttlSeconds: 1,
  })
  const tamperedToken = `${token.slice(0, -1)}x`

  assert.equal(
    verifyAdminSessionToken(token, {
      secret: 'test-secret',
      now: 1_800_000_002_000,
    }),
    undefined,
  )
  assert.equal(
    verifyAdminSessionToken(tamperedToken, {
      secret: 'test-secret',
      now: 1_800_000_000_500,
    }),
    undefined,
  )
})
