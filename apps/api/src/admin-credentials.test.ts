import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyEnvAdminLogin } from './admin-credentials.js'

test('verifies admin login from environment credentials', () => {
  const admin = verifyEnvAdminLogin(
    { username: 'admin', password: 'strong-password' },
    {
      password: 'strong-password',
      displayName: '运营负责人',
    },
  )

  assert.deepEqual(admin, {
    role: 'admin',
    userId: 'admin_env',
    username: 'admin',
    displayName: '运营负责人',
  })
})

test('rejects demo password when environment password is configured', () => {
  assert.equal(
    verifyEnvAdminLogin(
      { username: 'admin', password: 'admin123' },
      {
        password: 'strong-password',
      },
    ),
    undefined,
  )
})

test('does not handle login when environment password is missing', () => {
  assert.equal(
    verifyEnvAdminLogin(
      { username: 'admin', password: 'admin123' },
      {},
    ),
    undefined,
  )
})
