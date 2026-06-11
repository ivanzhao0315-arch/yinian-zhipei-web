import './env.js'
import { existsSync } from 'node:fs'

const value = (name: string) => process.env[name]?.trim()
const has = (name: string) => Boolean(value(name))
const mask = (raw?: string) => {
  if (!raw) return '未配置'
  if (raw.length <= 8) return '已配置'
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`
}

const appIds = value('WECHAT_PAY_APPIDS')
  ? value('WECHAT_PAY_APPIDS')!
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  : value('WECHAT_PAY_APPID')
    ? [value('WECHAT_PAY_APPID')!]
    : []

const privateKeyPath = value('WECHAT_PAY_PRIVATE_KEY_PATH')
const privateKey = value('WECHAT_PAY_PRIVATE_KEY')
const notificationTemplateEnvNames = [
  'WECHAT_NOTIFY_TEMPLATE_ORDER_CREATED',
  'WECHAT_NOTIFY_TEMPLATE_ORDER_CONFIRMED',
  'WECHAT_NOTIFY_TEMPLATE_PAYMENT_PAID',
  'WECHAT_NOTIFY_TEMPLATE_FAMILY_ASSIGNED',
  'WECHAT_NOTIFY_TEMPLATE_ESCORT_ASSIGNED',
  'WECHAT_NOTIFY_TEMPLATE_PROGRESS_UPDATED',
  'WECHAT_NOTIFY_TEMPLATE_EXCEPTION_CREATED',
]

const checks = [
  ['WECHAT_PAY_MODE', value('WECHAT_PAY_MODE') ?? 'mock'],
  ['WECHAT_LOGIN_MODE', value('WECHAT_LOGIN_MODE') ?? value('WECHAT_PAY_MODE') ?? 'mock'],
  ['AppID 数量', String(appIds.length)],
  ['WECHAT_PAY_MCH_ID', mask(value('WECHAT_PAY_MCH_ID'))],
  ['WECHAT_PAY_SERIAL_NO', mask(value('WECHAT_PAY_SERIAL_NO'))],
  [
    '商户 API 私钥',
    privateKey
      ? '已配置环境变量'
      : privateKeyPath
      ? existsSync(privateKeyPath)
          ? '已配置路径，文件存在'
          : '已配置路径，但文件不存在'
        : '未配置',
  ],
  ['WECHAT_PAY_API_V3_KEY', has('WECHAT_PAY_API_V3_KEY') ? '已配置' : '未配置'],
  ['WECHAT_PAY_NOTIFY_URL', value('WECHAT_PAY_NOTIFY_URL') ?? '未配置'],
  [
    '小程序 AppSecret',
    has('WECHAT_MINI_APP_SECRET') || has('WECHAT_MINI_APP_SECRETS')
      ? '已配置'
      : '未配置',
  ],
  ['WECHAT_NOTIFY_MODE', value('WECHAT_NOTIFY_MODE') ?? 'mock'],
  ['订阅消息模板数量', String(notificationTemplateEnvNames.filter(has).length)],
]

console.table(
  checks.map(([name, status]) => ({
    item: name,
    status,
  })),
)

const missingForLive = [
  appIds.length ? undefined : 'WECHAT_PAY_APPID 或 WECHAT_PAY_APPIDS',
  has('WECHAT_PAY_MCH_ID') ? undefined : 'WECHAT_PAY_MCH_ID',
  has('WECHAT_PAY_SERIAL_NO') ? undefined : 'WECHAT_PAY_SERIAL_NO',
  privateKey || (privateKeyPath && existsSync(privateKeyPath))
    ? undefined
    : 'WECHAT_PAY_PRIVATE_KEY 或 WECHAT_PAY_PRIVATE_KEY_PATH',
  has('WECHAT_PAY_API_V3_KEY') ? undefined : 'WECHAT_PAY_API_V3_KEY',
  has('WECHAT_PAY_NOTIFY_URL') ? undefined : 'WECHAT_PAY_NOTIFY_URL',
  has('WECHAT_MINI_APP_SECRET') || has('WECHAT_MINI_APP_SECRETS')
    ? undefined
    : 'WECHAT_MINI_APP_SECRET 或 WECHAT_MINI_APP_SECRETS',
].filter(Boolean)

if (value('WECHAT_PAY_MODE') === 'live' && missingForLive.length) {
  console.error(`live 模式缺少配置：${missingForLive.join(', ')}`)
  process.exit(1)
}
