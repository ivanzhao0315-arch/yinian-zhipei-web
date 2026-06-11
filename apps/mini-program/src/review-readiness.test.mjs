import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const srcDir = dirname(fileURLToPath(import.meta.url))
const readSource = (relativePath) => readFileSync(join(srcDir, relativePath), 'utf8')
const sourceExists = (relativePath) => existsSync(join(srcDir, relativePath))

describe('mini-program review readiness', () => {
  it('exposes user agreement and privacy policy pages in the mini-program routes', () => {
    const appConfig = readSource('app.config.ts')

    assert.match(appConfig, /pages\/agreement\/index/)
    assert.match(appConfig, /pages\/privacy\/index/)
    assert.equal(sourceExists('pages/agreement/index.tsx'), true)
    assert.equal(sourceExists('pages/privacy/index.tsx'), true)
  })

  it('centralizes customer service phone usage for review and real users', () => {
    const supportConfig = readSource('utils/support.ts')
    const profilePage = readSource('pages/profile/index.tsx')
    const ordersPage = readSource('pages/orders/index.tsx')

    assert.match(supportConfig, /CUSTOMER_SERVICE_PHONE/)
    assert.match(profilePage, /CUSTOMER_SERVICE_PHONE/)
    assert.match(ordersPage, /CUSTOMER_SERVICE_PHONE/)
  })

  it('requires users to accept the agreement and privacy policy before order submission', () => {
    const confirmPage = readSource('pages/confirm/index.tsx')

    assert.match(confirmPage, /agreementAccepted/)
    assert.match(confirmPage, /请先同意用户协议和隐私政策/)
    assert.match(confirmPage, /\/pages\/agreement\/index/)
    assert.match(confirmPage, /\/pages\/privacy\/index/)
  })
})
