import { createCipheriv, createDecipheriv, randomBytes, createSign } from 'node:crypto'
import { readFile } from 'node:fs/promises'

type WechatPayConfig = {
  mode: 'mock' | 'live'
  loginMode: 'mock' | 'live'
  appIds: string[]
  appSecrets: Record<string, string>
  mchId: string
  merchantSerialNo: string
  privateKey?: string
  privateKeyPath?: string
  apiV3Key?: string
  notifyUrl: string
  refundNotifyUrl?: string
}

type MiniProgramPayParams = {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

type PrepayInput = {
  appId?: string
  description: string
  outTradeNo: string
  amountFen: number
  payerOpenId: string
}

type WechatTransactionQuery = {
  outTradeNo: string
}

type WechatRefundInput = {
  outTradeNo: string
  outRefundNo: string
  refundAmountFen: number
  totalAmountFen: number
  reason?: string
}

type WechatRefundQuery = {
  outRefundNo: string
}

type WechatRefundResult = {
  out_trade_no?: string
  out_refund_no: string
  refund_id?: string
  status: string
  success_time?: string
  amount?: {
    refund?: number
    total?: number
    payer_refund?: number
    currency?: string
  }
  user_received_account?: string
}

type WechatNotificationResource = {
  associated_data: string
  nonce: string
  ciphertext: string
}

type LoginCodeInput = {
  appId?: string
  code: string
}

const WECHAT_JSAPI_PREPAY_PATH = '/v3/pay/transactions/jsapi'
const WECHAT_REFUND_PATH = '/v3/refund/domestic/refunds'
const WECHAT_PAY_API_BASE = 'https://api.mch.weixin.qq.com'
const WECHAT_CODE2SESSION_API = 'https://api.weixin.qq.com/sns/jscode2session'

const randomString = () => randomBytes(16).toString('hex')

const rsaSign = (message: string, privateKey: string) =>
  createSign('RSA-SHA256').update(message).sign(privateKey, 'base64')

const getRequired = (name: string, fallback?: string) => {
  const value = process.env[name]?.trim() || fallback
  if (!value) {
    throw new Error(`missing_env_${name.toLowerCase()}`)
  }
  return value
}

const deriveRefundNotifyUrl = (notifyUrl: string) => {
  if (notifyUrl.endsWith('/notify')) {
    return notifyUrl.replace(/\/notify$/, '/refund-notify')
  }
  return `${notifyUrl.replace(/\/$/, '')}/refund-notify`
}

const parseAppIds = () => {
  const multiple = process.env.WECHAT_PAY_APPIDS
  if (multiple) {
    return multiple
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return [getRequired('WECHAT_PAY_APPID', 'demo_appid')]
}

const parseAppSecrets = () => {
  const secrets: Record<string, string> = {}
  const multiple = process.env.WECHAT_MINI_APP_SECRETS

  if (multiple) {
    multiple
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const [appId, secret] = item.split(':')
        if (appId && secret) {
          secrets[appId] = secret
        }
      })
  }

  const singleAppId = process.env.WECHAT_PAY_APPID
  const singleSecret = process.env.WECHAT_MINI_APP_SECRET
  if (singleAppId && singleSecret) {
    secrets[singleAppId] = singleSecret
  }

  return secrets
}

export const loadWechatPayConfig = (): WechatPayConfig => {
  const mode = process.env.WECHAT_PAY_MODE === 'live' ? 'live' : 'mock'
  const loginMode = process.env.WECHAT_LOGIN_MODE === 'live' ? 'live' : mode
  const notifyUrl = getRequired(
    'WECHAT_PAY_NOTIFY_URL',
    'https://example.com/api/payments/wechat/notify',
  )

  return {
    mode,
    loginMode,
    appIds: parseAppIds(),
    appSecrets: parseAppSecrets(),
    mchId: getRequired('WECHAT_PAY_MCH_ID', 'demo_mchid'),
    merchantSerialNo: getRequired('WECHAT_PAY_SERIAL_NO', 'demo_serial_no'),
    privateKey: process.env.WECHAT_PAY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
    notifyUrl,
    refundNotifyUrl: process.env.WECHAT_PAY_REFUND_NOTIFY_URL || deriveRefundNotifyUrl(notifyUrl),
  }
}

export const resolveWechatPayAppId = (config: WechatPayConfig, requestedAppId?: string) => {
  const selectedAppId = requestedAppId ?? config.appIds[0]

  if (!selectedAppId || !config.appIds.includes(selectedAppId)) {
    throw new Error('wechat_appid_not_allowed')
  }

  return selectedAppId
}

export const buildMiniProgramPayParams = (
  appId: string,
  prepayId: string,
  privateKey: string,
): MiniProgramPayParams => {
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomString()
  const packageValue = `prepay_id=${prepayId}`
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`

  return {
    appId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign: rsaSign(message, privateKey),
  }
}

export const buildMockMiniProgramPayParams = (
  appId: string,
  prepayId: string,
): MiniProgramPayParams => ({
  appId,
  timeStamp: String(Math.floor(Date.now() / 1000)),
  nonceStr: randomString(),
  package: `prepay_id=${prepayId}`,
  signType: 'RSA',
  paySign: `mock_${randomString()}`,
})

export const exchangeWechatLoginCode = async (
  config: WechatPayConfig,
  input: LoginCodeInput,
) => {
  const appId = resolveWechatPayAppId(config, input.appId)

  if (config.loginMode === 'mock') {
    return {
      appId,
      openId: `mock_openid_${appId}_${input.code}`,
      sessionKey: `mock_session_${input.code}`,
    }
  }

  const appSecret = config.appSecrets[appId]
  if (!appSecret) {
    throw new Error('missing_wechat_app_secret')
  }

  const url = new URL(WECHAT_CODE2SESSION_API)
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)
  url.searchParams.set('js_code', input.code)
  url.searchParams.set('grant_type', 'authorization_code')

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('wechat_code2session_network_failed')
  }

  let data: {
    openid?: string
    session_key?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }
  try {
    data = (await response.json()) as typeof data
  } catch {
    throw new Error('wechat_code2session_invalid_response')
  }

  if (!response.ok || data.errcode || !data.openid) {
    throw new Error(`wechat_code2session_failed_${data.errcode ?? response.status}`)
  }

  return {
    appId,
    openId: data.openid,
    sessionKey: data.session_key,
    unionId: data.unionid,
  }
}

export const decryptWechatPayResource = (
  apiV3Key: string,
  resource: WechatNotificationResource,
) => {
  const encrypted = Buffer.from(resource.ciphertext, 'base64')
  const authTag = encrypted.subarray(encrypted.length - 16)
  const ciphertext = encrypted.subarray(0, encrypted.length - 16)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8'),
  )

  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'))

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(decrypted.toString('utf8')) as {
    out_trade_no: string
    out_refund_no?: string
    transaction_id?: string
    refund_id?: string
    trade_state?: string
    refund_status?: string
    success_time?: string
    amount?: {
      payer_total?: number
      total?: number
      refund?: number
      payer_refund?: number
    }
  }
}

export const encryptWechatPayResourceForTest = (apiV3Key: string, plain: object) => {
  const nonce = randomString().slice(0, 12)
  const associatedData = 'transaction'
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(nonce, 'utf8'),
  )

  cipher.setAAD(Buffer.from(associatedData, 'utf8'))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(plain), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ])

  return {
    associated_data: associatedData,
    nonce,
    ciphertext: encrypted.toString('base64'),
  }
}

const buildAuthorization = (
  config: WechatPayConfig,
  privateKey: string,
  method: string,
  path: string,
  body: string,
) => {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomString()
  const signature = rsaSign(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`, privateKey)

  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.merchantSerialNo}"`
}

export const createWechatJsapiPrepay = async (
  config: WechatPayConfig,
  input: PrepayInput,
) => {
  const appId = resolveWechatPayAppId(config, input.appId)

  if (config.mode === 'mock') {
    const prepayId = `mock_prepay_${input.outTradeNo}`
    return {
      prepayId,
      payParams: buildMockMiniProgramPayParams(appId, prepayId),
      raw: { mock: true },
    }
  }

  if (!config.privateKeyPath) {
    if (config.privateKey) {
      const prepayId = await createLiveWechatPrepay(config, config.privateKey, appId, input)
      return {
        prepayId,
        payParams: buildMiniProgramPayParams(appId, prepayId, config.privateKey),
        raw: { prepay_id: prepayId },
      }
    }
    throw new Error('missing_wechat_private_key_path')
  }

  const privateKey = await readFile(config.privateKeyPath, 'utf8')
  const prepayId = await createLiveWechatPrepay(config, privateKey, appId, input)

  return {
    prepayId,
    payParams: buildMiniProgramPayParams(appId, prepayId, privateKey),
    raw: { prepay_id: prepayId },
  }
}

export const queryWechatPayTransaction = async (
  config: WechatPayConfig,
  input: WechatTransactionQuery,
) => {
  if (config.mode === 'mock') {
    return {
      out_trade_no: input.outTradeNo,
      trade_state: 'SUCCESS',
      trade_state_desc: 'mock paid',
      transaction_id: `mock_tx_${input.outTradeNo}`,
    }
  }

  const privateKey = config.privateKey
    ? config.privateKey
    : config.privateKeyPath
      ? await readFile(config.privateKeyPath, 'utf8')
      : undefined

  if (!privateKey) {
    throw new Error('missing_wechat_private_key_path')
  }

  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(input.outTradeNo)}?mchid=${config.mchId}`
  const response = await fetch(`${WECHAT_PAY_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: buildAuthorization(config, privateKey, 'GET', path, ''),
      Accept: 'application/json',
    },
  })
  const data = (await response.json().catch(() => ({}))) as {
    appid?: string
    mchid?: string
    out_trade_no?: string
    transaction_id?: string
    trade_state?: string
    trade_state_desc?: string
    success_time?: string
    amount?: {
      total?: number
      payer_total?: number
      currency?: string
      payer_currency?: string
    }
    code?: string
    message?: string
  }

  if (!response.ok) {
    const code = data.code ? `_${data.code}` : ''
    throw new Error(`wechat_transaction_query_failed_${response.status}${code}`)
  }

  return data
}

export const createWechatRefundRequest = async (
  config: WechatPayConfig,
  input: WechatRefundInput,
): Promise<WechatRefundResult> => {
  if (config.mode === 'mock') {
    return {
      out_trade_no: input.outTradeNo,
      out_refund_no: input.outRefundNo,
      refund_id: `mock_refund_${input.outRefundNo}`,
      status: 'SUCCESS',
      amount: {
        refund: input.refundAmountFen,
        total: input.totalAmountFen,
        currency: 'CNY',
      },
      user_received_account: '支付用户零钱',
    }
  }

  const privateKey = config.privateKey
    ? config.privateKey
    : config.privateKeyPath
      ? await readFile(config.privateKeyPath, 'utf8')
      : undefined

  if (!privateKey) {
    throw new Error('missing_wechat_private_key_path')
  }

  const body = JSON.stringify({
    out_trade_no: input.outTradeNo,
    out_refund_no: input.outRefundNo,
    reason: input.reason,
    notify_url: config.refundNotifyUrl ?? deriveRefundNotifyUrl(config.notifyUrl),
    amount: {
      refund: input.refundAmountFen,
      total: input.totalAmountFen,
      currency: 'CNY',
    },
  })
  const response = await fetch(`${WECHAT_PAY_API_BASE}${WECHAT_REFUND_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthorization(
        config,
        privateKey,
        'POST',
        WECHAT_REFUND_PATH,
        body,
      ),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
  })
  const data = (await response.json().catch(() => ({}))) as {
    out_trade_no?: string
    out_refund_no?: string
    refund_id?: string
    status?: string
    success_time?: string
    amount?: {
      refund?: number
      total?: number
      currency?: string
    }
    code?: string
    message?: string
  }

  if (!response.ok || !data.out_refund_no || !data.status) {
    const code = data.code ? `_${data.code}` : ''
    throw new Error(`wechat_refund_failed_${response.status}${code}`)
  }

  return {
    out_refund_no: data.out_refund_no,
    refund_id: data.refund_id,
    status: data.status,
    success_time: data.success_time,
    amount: data.amount,
  }
}

export const queryWechatRefund = async (
  config: WechatPayConfig,
  input: WechatRefundQuery,
): Promise<WechatRefundResult> => {
  if (config.mode === 'mock') {
    return {
      out_refund_no: input.outRefundNo,
      refund_id: `mock_refund_${input.outRefundNo}`,
      status: 'SUCCESS',
      amount: {
        refund: 0,
        total: 0,
        currency: 'CNY',
      },
    }
  }

  const privateKey = config.privateKey
    ? config.privateKey
    : config.privateKeyPath
      ? await readFile(config.privateKeyPath, 'utf8')
      : undefined

  if (!privateKey) {
    throw new Error('missing_wechat_private_key_path')
  }

  const path = `${WECHAT_REFUND_PATH}/${encodeURIComponent(input.outRefundNo)}`
  const response = await fetch(`${WECHAT_PAY_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: buildAuthorization(config, privateKey, 'GET', path, ''),
      Accept: 'application/json',
    },
  })
  const data = (await response.json().catch(() => ({}))) as {
    out_refund_no?: string
    refund_id?: string
    status?: string
    success_time?: string
    amount?: {
      refund?: number
      total?: number
      payer_refund?: number
      currency?: string
    }
    code?: string
    message?: string
  }

  if (!response.ok || !data.out_refund_no || !data.status) {
    const code = data.code ? `_${data.code}` : ''
    throw new Error(`wechat_refund_query_failed_${response.status}${code}`)
  }

  return {
    out_refund_no: data.out_refund_no,
    refund_id: data.refund_id,
    status: data.status,
    success_time: data.success_time,
    amount: data.amount,
  }
}

const createLiveWechatPrepay = async (
  config: WechatPayConfig,
  privateKey: string,
  appId: string,
  input: PrepayInput,
) => {
  const body = JSON.stringify({
    appid: appId,
    mchid: config.mchId,
    description: input.description,
    out_trade_no: input.outTradeNo,
    notify_url: config.notifyUrl,
    amount: {
      total: input.amountFen,
      currency: 'CNY',
    },
    payer: {
      openid: input.payerOpenId,
    },
  })
  const response = await fetch(`${WECHAT_PAY_API_BASE}${WECHAT_JSAPI_PREPAY_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthorization(
        config,
        privateKey,
        'POST',
        WECHAT_JSAPI_PREPAY_PATH,
        body,
      ),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
  })
  const data = (await response.json().catch(() => ({}))) as {
    prepay_id?: string
    code?: string
    message?: string
  }

  if (!response.ok || !data.prepay_id) {
    const code = data.code ? `_${data.code}` : ''
    throw new Error(`wechat_prepay_failed_${response.status}${code}`)
  }

  return data.prepay_id
}

export type { MiniProgramPayParams, WechatPayConfig }
