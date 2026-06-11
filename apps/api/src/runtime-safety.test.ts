import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowBodyOpenIdLogin,
  allowDevEndpoints,
  isProductionRuntime,
  shouldSeedDemoData,
} from './runtime-safety.js'

test('treats live WeChat Pay mode as production even when NODE_ENV is unset', () => {
  const flags = { wechatPayMode: 'live' }

  assert.equal(isProductionRuntime(flags), true)
  assert.equal(shouldSeedDemoData(flags), false)
  assert.equal(allowDevEndpoints(flags), false)
  assert.equal(allowBodyOpenIdLogin(flags), false)
})

test('requires an explicit local opt-in before seeding demo data', () => {
  assert.equal(shouldSeedDemoData({ nodeEnv: 'development', wechatPayMode: 'mock' }), false)
  assert.equal(shouldSeedDemoData({
    nodeEnv: 'development',
    wechatPayMode: 'mock',
    seedDemoData: 'true',
  }), true)
})

test('allows local dev endpoints but supports explicit local shutdown', () => {
  assert.equal(allowDevEndpoints({ nodeEnv: 'development', wechatPayMode: 'mock' }), true)
  assert.equal(allowDevEndpoints({
    nodeEnv: 'development',
    wechatPayMode: 'mock',
    enableDevEndpoints: 'false',
  }), false)
})
