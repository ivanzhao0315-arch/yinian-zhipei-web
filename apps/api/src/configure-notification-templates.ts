import './env.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url))

const templateEnvNames = [
  'WECHAT_NOTIFY_TEMPLATE_ORDER_CREATED',
  'WECHAT_NOTIFY_TEMPLATE_ORDER_CONFIRMED',
  'WECHAT_NOTIFY_TEMPLATE_PAYMENT_PAID',
  'WECHAT_NOTIFY_TEMPLATE_FAMILY_ASSIGNED',
  'WECHAT_NOTIFY_TEMPLATE_ESCORT_ASSIGNED',
  'WECHAT_NOTIFY_TEMPLATE_PROGRESS_UPDATED',
  'WECHAT_NOTIFY_TEMPLATE_EXCEPTION_CREATED',
] as const

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [rawKey, ...rawValue] = arg.replace(/^--/, '').split('=')
    return [rawKey, rawValue.join('=')]
  }),
)

const mapping: Record<string, string> = {
  WECHAT_NOTIFY_MODE: args.mode || 'mock',
  WECHAT_NOTIFY_MINIPROGRAM_STATE: args.state || 'developer',
  WECHAT_NOTIFY_TEMPLATE_ORDER_CREATED: args.orderCreated || '',
  WECHAT_NOTIFY_TEMPLATE_ORDER_CONFIRMED: args.orderConfirmed || '',
  WECHAT_NOTIFY_TEMPLATE_PAYMENT_PAID: args.paymentPaid || '',
  WECHAT_NOTIFY_TEMPLATE_FAMILY_ASSIGNED: args.familyAssigned || '',
  WECHAT_NOTIFY_TEMPLATE_ESCORT_ASSIGNED: args.escortAssigned || '',
  WECHAT_NOTIFY_TEMPLATE_PROGRESS_UPDATED: args.progressUpdated || '',
  WECHAT_NOTIFY_TEMPLATE_EXCEPTION_CREATED: args.exceptionCreated || '',
}

const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const lines = existing ? existing.split(/\r?\n/) : []
const seen = new Set<string>()

const updated = lines.map((line) => {
  const key = line.includes('=') ? line.split('=')[0] : ''
  if (Object.prototype.hasOwnProperty.call(mapping, key)) {
    seen.add(key)
    return `${key}=${mapping[key]}`
  }
  return line
})

for (const [key, value] of Object.entries(mapping)) {
  if (!seen.has(key)) {
    updated.push(`${key}=${value}`)
  }
}

writeFileSync(envPath, `${updated.filter((line, index, all) => line || index < all.length - 1).join('\n')}\n`)

const configuredCount = templateEnvNames.filter((name) => mapping[name]).length
console.log(`通知模板配置已写入 ${envPath}`)
console.log(`已配置模板数量：${configuredCount}`)
console.log(`通知模式：${mapping.WECHAT_NOTIFY_MODE}`)
