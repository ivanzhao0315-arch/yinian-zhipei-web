import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveEscortBindOpenId } from './escort-auth.js'

test('uses CloudBase injected openid before falling back to code2Session', async () => {
  let exchangeCalled = false

  const openId = await resolveEscortBindOpenId({
    cloudOpenId: ' wx_cloud_openid ',
    appId: 'wx_test',
    code: 'login_code',
    exchangeLoginCode: async () => {
      exchangeCalled = true
      return { openId: 'wx_code2session_openid' }
    },
  })

  assert.equal(openId, 'wx_cloud_openid')
  assert.equal(exchangeCalled, false)
})

test('falls back to code2Session when CloudBase openid is absent', async () => {
  const openId = await resolveEscortBindOpenId({
    appId: 'wx_test',
    code: 'login_code',
    exchangeLoginCode: async (input) => {
      assert.deepEqual(input, {
        appId: 'wx_test',
        code: 'login_code',
      })
      return { openId: 'wx_code2session_openid' }
    },
  })

  assert.equal(openId, 'wx_code2session_openid')
})
