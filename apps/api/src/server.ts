import './env.js'
import cors from '@fastify/cors'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  orderStatuses,
  progressStepList,
  servicePackages,
  type OrderStatus,
  type ProgressStepKey,
  type ServicePackageKey,
} from '@yinian-zhipei/shared'
import { createSqliteStore, type EscortStatus } from './sqlite-store.js'
import { verifyEnvAdminLogin } from './admin-credentials.js'
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from './admin-session.js'
import { createMysqlSnapshotStore } from './mysql-snapshot-store.js'
import {
  createWechatRefundRequest,
  createWechatJsapiPrepay,
  decryptWechatPayResource,
  exchangeWechatLoginCode,
  loadWechatPayConfig,
  queryWechatRefund,
  queryWechatPayTransaction,
} from './wechat-pay.js'
import { loadNotificationConfig, NotificationService } from './notifications.js'
import { resolveEscortBindOpenId } from './escort-auth.js'
import {
  allowBodyOpenIdLogin,
  allowDevEndpoints,
  isProductionRuntime as getIsProductionRuntime,
  shouldSeedDemoData,
} from './runtime-safety.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

const databasePath = process.env.DATABASE_PATH
  ? process.env.DATABASE_PATH
  : fileURLToPath(new URL('../.data/dev.db', import.meta.url))

const mysqlConfig = {
  address: process.env.MYSQL_ADDRESS,
  username: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  snapshotId: process.env.MYSQL_SNAPSHOT_ID,
}
const runtimeFlags = {
  nodeEnv: process.env.NODE_ENV,
  wechatPayMode: process.env.WECHAT_PAY_MODE,
  seedDemoData: process.env.SEED_DEMO_DATA,
  enableDevEndpoints: process.env.ENABLE_DEV_ENDPOINTS,
}
const isProductionRuntime = getIsProductionRuntime(runtimeFlags)
const runtimeAllowsDevEndpoints = allowDevEndpoints(runtimeFlags)
const runtimeAllowsBodyOpenIdLogin = allowBodyOpenIdLogin(runtimeFlags)
const runtimeShouldSeedDemoData = shouldSeedDemoData(runtimeFlags)
const shouldUseMysqlSnapshot =
  process.env.STORAGE_DRIVER === 'mysql' ||
  process.env.STORAGE_DRIVER === 'mysql_snapshot' ||
  (!process.env.STORAGE_DRIVER &&
    Boolean(mysqlConfig.address && mysqlConfig.username && mysqlConfig.password))
if (shouldUseMysqlSnapshot && (!mysqlConfig.address || !mysqlConfig.username || !mysqlConfig.password)) {
  throw new Error('mysql_snapshot_missing_connection_env')
}
const persistenceDriver = shouldUseMysqlSnapshot ? 'mysql_snapshot' : 'sqlite'
const store = shouldUseMysqlSnapshot
  ? await createMysqlSnapshotStore({
      address: mysqlConfig.address as string,
      username: mysqlConfig.username as string,
      password: mysqlConfig.password as string,
      database: mysqlConfig.database,
      snapshotId: mysqlConfig.snapshotId,
      seedDemoData: runtimeShouldSeedDemoData,
    })
  : await createSqliteStore({ databasePath, seedDemoData: runtimeShouldSeedDemoData })
const wechatPayConfig = loadWechatPayConfig()
const adminSessionSecret =
  process.env.ADMIN_SESSION_SECRET ??
  process.env.WECHAT_PAY_API_V3_KEY ??
  'dev-admin-session-secret'
const envAdminConfig = {
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
  userId: process.env.ADMIN_USER_ID,
  displayName: process.env.ADMIN_DISPLAY_NAME,
}
const adminSessionTtlSeconds = Number(process.env.ADMIN_SESSION_TTL_SECONDS ?? 60 * 60 * 12)
const allowDemoAdminHeader =
  !isProductionRuntime && process.env.ALLOW_DEMO_ADMIN_HEADER !== 'false'
const allowDemoEscortHeader =
  !isProductionRuntime && process.env.ALLOW_DEMO_ESCORT_HEADER !== 'false'
const notificationService = new NotificationService(
  store,
  wechatPayConfig,
  loadNotificationConfig(),
)
const adminWebDistPath = process.env.ADMIN_WEB_DIST_PATH
  ? resolve(process.env.ADMIN_WEB_DIST_PATH)
  : fileURLToPath(new URL('../../admin-web/dist', import.meta.url))

const staticMimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

type Actor = {
  role: 'family' | 'admin' | 'escort'
  userId: string
  escortId?: string
}

const headerValue = (value: string | string[] | undefined, fallback: string) =>
  Array.isArray(value) ? (value[0] ?? fallback) : (value ?? fallback)

const optionalHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const bearerTokenFromRequest = (request: FastifyRequest) => {
  const authorization = optionalHeaderValue(request.headers.authorization)
  if (!authorization?.startsWith('Bearer ')) {
    return undefined
  }
  return authorization.slice('Bearer '.length).trim()
}

const cloudIdentityFromRequest = (request: FastifyRequest) => ({
  appId: optionalHeaderValue(request.headers['x-wx-appid']),
  openId:
    optionalHeaderValue(request.headers['x-wx-openid']) ??
    optionalHeaderValue(request.headers['x-wx-from-openid']),
})

const actorFromRequest = (request: FastifyRequest): Actor => {
  const role = headerValue(request.headers['x-demo-role'], 'family')
  const userId = headerValue(request.headers['x-demo-user-id'], 'user_demo')
  const escortId = headerValue(request.headers['x-demo-escort-id'], 'esc_003')
  const adminSession = verifyAdminSessionToken(bearerTokenFromRequest(request), {
    secret: adminSessionSecret,
  })

  if (adminSession) {
    return { role: 'admin', userId: adminSession.userId }
  }

  if (role === 'admin' && allowDemoAdminHeader) {
    return { role, userId }
  }
  if (role === 'escort' && allowDemoEscortHeader) {
    return { role, userId, escortId }
  }
  return { role: 'family', userId }
}

const requireRole = (
  request: FastifyRequest,
  reply: FastifyReply,
  role: Actor['role'],
) => {
  const actor = actorFromRequest(request)
  if (actor.role !== role) {
    reply.code(403).send({ error: 'forbidden' })
    return undefined
  }
  return actor
}

const requireEscortActor = async (request: FastifyRequest, reply: FastifyReply) => {
  const cloudIdentity = cloudIdentityFromRequest(request)
  if (cloudIdentity.openId) {
    const escortActor = await store.findEscortBindingByOpenId(cloudIdentity.openId)
    if (escortActor) {
      return escortActor
    }
  }

  if (allowDemoEscortHeader && optionalHeaderValue(request.headers['x-demo-role']) === 'escort') {
    const escortId = optionalHeaderValue(request.headers['x-demo-escort-id'])
    if (escortId) {
      return {
        role: 'escort' as const,
        userId: cloudIdentity.openId ?? headerValue(request.headers['x-demo-user-id'], 'escort_demo'),
        openId: cloudIdentity.openId,
        escortId,
      }
    }
  }

  reply.code(403).send({ error: 'forbidden' })
  return undefined
}

const notifyBestEffort = async (task: Promise<void>) => {
  try {
    await task
  } catch (error) {
    app.log.error({ error }, 'Notification task failed')
  }
}

const sendStoreError = (reply: FastifyReply, error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error'

  if (
    message === 'invalid_service_package' ||
    message === 'invalid_phone' ||
    message === 'invalid_progress_step' ||
    message === 'invalid_escort_profile' ||
    message === 'invalid_escort_status' ||
    message === 'invalid_hospital_name' ||
    message === 'invalid_visit_date' ||
    message === 'invalid_visit_time' ||
    message === 'invalid_contact_name' ||
    message === 'invalid_contact_phone' ||
    message === 'invalid_elder_relation' ||
    message === 'invalid_estimated_price' ||
    message === 'invalid_actual_duration_minutes' ||
    message === 'invalid_overtime_minutes' ||
    message === 'invalid_visit_result' ||
    message === 'invalid_follow_up_advice' ||
    message === 'invalid_operator_note' ||
    message === 'invalid_cancel_reason' ||
    message === 'invalid_refund_amount' ||
    message === 'invalid_refund_status' ||
    message === 'escort_phone_not_allowed' ||
    message === 'escort_phone_mismatch' ||
    message === 'invalid_escort_access_code' ||
    message === 'escort_access_code_not_allowed' ||
    message === 'wechat_appid_not_allowed' ||
    message === 'missing_wechat_app_secret'
  ) {
    return reply.code(400).send({ error: message })
  }
  if (message.startsWith('wechat_code2session_')) {
    return reply.code(502).send({ error: message })
  }
  if (message === 'order_not_found' || message === 'escort_not_found' || message === 'whitelist_not_found' || message === 'refund_not_found') {
    return reply.code(404).send({ error: message })
  }
  if (message === 'invalid_status_transition' || message === 'order_not_in_exception' || message === 'escort_phone_exists' || message === 'payment_not_paid') {
    return reply.code(409).send({ error: message })
  }
  if (message === 'payment_not_found') {
    return reply.code(404).send({ error: message })
  }
  if (message === 'forbidden') {
    return reply.code(403).send({ error: message })
  }
  if (message.startsWith('wechat_prepay_failed_')) {
    return reply.code(502).send({ error: message })
  }
  if (message.startsWith('wechat_transaction_query_failed_')) {
    return reply.code(502).send({ error: message })
  }
  if (message.startsWith('wechat_refund_failed_')) {
    return reply.code(502).send({ error: message })
  }
  if (message.startsWith('wechat_refund_query_failed_')) {
    return reply.code(502).send({ error: message })
  }

  app.log.error({ error }, 'Unhandled API error')
  return reply.code(500).send({ error: 'internal_server_error' })
}

app.addHook('onClose', async () => {
  await store.close()
})

app.get('/health', async () => ({
  ok: true,
  service: 'yinian-zhipei-api',
  persistence: persistenceDriver,
}))

const sendAdminAsset = async (reply: FastifyReply, relativePath: string) => {
  const filePath = resolve(adminWebDistPath, relativePath)
  const isInsideDist =
    filePath === adminWebDistPath ||
    filePath.startsWith(`${adminWebDistPath}/`)

  if (!isInsideDist) {
    return reply.code(404).send({ error: 'admin_asset_not_found' })
  }

  try {
    const file = await readFile(filePath)
    return reply
      .type(staticMimeTypes[extname(filePath)] ?? 'application/octet-stream')
      .send(file)
  } catch {
    return reply.code(404).send({ error: 'admin_asset_not_found' })
  }
}

app.get('/', async (_request, reply) => sendAdminAsset(reply, 'index.html'))

app.get<{ Params: { '*': string } }>('/assets/*', async (request, reply) =>
  sendAdminAsset(reply, `assets/${request.params['*']}`),
)

app.get('/api/debug/wechat-config', async (_request, reply) => {
  if (!runtimeAllowsDevEndpoints) {
    return reply.code(404).send({ error: 'not_found' })
  }
  return {
    payMode: wechatPayConfig.mode,
    loginMode: wechatPayConfig.loginMode,
    appIds: wechatPayConfig.appIds,
    appSecretAppIds: Object.keys(wechatPayConfig.appSecrets),
    hasMerchantPrivateKey: Boolean(wechatPayConfig.privateKey || wechatPayConfig.privateKeyPath),
    hasApiV3Key: Boolean(wechatPayConfig.apiV3Key),
    hasNotifyUrl: Boolean(wechatPayConfig.notifyUrl),
    merchantSerialNoSuffix: wechatPayConfig.merchantSerialNo.slice(-8),
  }
})

app.get('/api/debug/outbound-ip', async (request, reply) => {
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = (await response.json()) as { ip?: string }
    return { ip: data.ip ?? null }
  } catch {
    return reply.code(502).send({ error: 'outbound_ip_lookup_failed' })
  }
})

app.get('/api/debug/wechat-network', async (request, reply) => {
  try {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', 'invalid_appid')
    url.searchParams.set('secret', 'invalid_secret')
    url.searchParams.set('js_code', 'invalid_code')
    url.searchParams.set('grant_type', 'authorization_code')
    const response = await fetch(url)
    const data = (await response.json().catch(() => ({}))) as {
      errcode?: number
      errmsg?: string
    }
    return {
      ok: response.ok,
      status: response.status,
      errcode: data.errcode ?? null,
      errmsg: data.errmsg ?? null,
    }
  } catch {
    return reply.code(502).send({ error: 'wechat_network_lookup_failed' })
  }
})

app.get('/api/meta', async () => ({
  servicePackages,
  orderStatuses,
  progressStepList,
}))

app.get('/api/notifications/templates', async () => ({
  family: notificationService.familyTemplateIds(),
  familyOrder: notificationService.familyOrderTemplateIds(),
  familyService: notificationService.familyServiceTemplateIds(),
  escort: notificationService.escortTemplateIds(),
}))

app.post<{
  Body: {
    appId?: string
    code?: string
    openId?: string
    nickname?: string
    phone?: string
  }
}>('/api/auth/demo/wechat-login', async (request, reply) => {
  try {
    const cloudIdentity = cloudIdentityFromRequest(request)
    if (
      !cloudIdentity.openId &&
      !request.body.code &&
      (!request.body.openId || !runtimeAllowsBodyOpenIdLogin)
    ) {
      return reply.code(400).send({ error: 'login_code_or_open_id_required' })
    }

    const session = cloudIdentity.openId
      ? {
          appId: cloudIdentity.appId ?? request.body.appId,
          openId: cloudIdentity.openId,
        }
      : request.body.code
        ? await exchangeWechatLoginCode(wechatPayConfig, {
            appId: request.body.appId,
            code: request.body.code,
          })
        : {
            appId: request.body.appId,
            openId: request.body.openId as string,
          }

    return store.upsertFamilyUserByOpenId({
      openId: session.openId,
      nickname: request.body.nickname,
      phone: request.body.phone,
    })
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    username: string
    password: string
  }
}>('/api/admin/auth/demo-login', async (request, reply) => {
  const admin =
    verifyEnvAdminLogin(request.body, envAdminConfig) ??
    (!isProductionRuntime && !envAdminConfig.password
      ? await store.verifyAdminLogin(request.body)
      : undefined)
  if (!admin) {
    return reply.code(401).send({ error: 'invalid_credentials' })
  }

  const now = Date.now()
  return {
    admin,
    token: createAdminSessionToken({
      userId: admin.userId,
      secret: adminSessionSecret,
      now,
      ttlSeconds: adminSessionTtlSeconds,
    }),
    expiresAt: new Date(now + adminSessionTtlSeconds * 1000).toISOString(),
  }
})

app.post<{
  Body: {
    appId?: string
    code: string
    escortId: string
    accessCode?: string
    phone?: string
  }
}>('/api/escort/auth/wechat-bind', async (request, reply) => {
  if (!request.body.code || !request.body.escortId) {
    return reply.code(400).send({ error: 'login_code_and_escort_id_required' })
  }

  try {
    if (!request.body.accessCode) {
      return reply.code(400).send({ error: 'invalid_escort_access_code' })
    }
    const access = await store.verifyEscortAccessCode(request.body.accessCode)
    const accessEscortId = access.escort?.id ?? access.escortId
    if (accessEscortId !== request.body.escortId) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const openId = await resolveEscortBindOpenId({
      cloudOpenId: cloudIdentityFromRequest(request).openId,
      appId: request.body.appId,
      code: request.body.code,
      exchangeLoginCode: (input) => exchangeWechatLoginCode(wechatPayConfig, input),
    })
    return await store.bindEscortOpenId({
      openId,
      escortId: request.body.escortId,
      phone: request.body.phone,
    })
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    openId: string
    escortId: string
    phone?: string
  }
}>('/api/escort/auth/demo-bind', async (request, reply) => {
  if (!allowDemoEscortHeader) {
    return reply.code(404).send({ error: 'not_found' })
  }

  if (!request.body.openId || !request.body.escortId) {
    return reply.code(400).send({ error: 'invalid_binding_request' })
  }

  try {
    return await store.bindEscortOpenId(request.body)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    accessCode: string
  }
}>('/api/escort/auth/code-verify', async (request, reply) => {
  try {
    if (!request.body.accessCode) {
      return reply.code(400).send({ error: 'invalid_escort_access_code' })
    }

    return await store.verifyEscortAccessCode(request.body.accessCode)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    orderId: string
    appId?: string
    payerOpenId?: string
  }
}>('/api/payments/wechat/prepay', async (request, reply) => {
  const actor = actorFromRequest(request)
  const payerOpenId = request.body.payerOpenId ?? actor.userId

  try {
    const payment = await store.createWechatPayment({
      orderId: request.body.orderId,
      userId: actor.userId,
      payerOpenId,
    })
    const prepay = await createWechatJsapiPrepay(wechatPayConfig, {
      appId: request.body.appId,
      description: `颐年智陪陪诊服务 ${payment.outTradeNo}`,
      outTradeNo: payment.outTradeNo,
      amountFen: payment.amountFen,
      payerOpenId,
    })
    const updatedPayment = await store.attachWechatPrepayId(
      payment.outTradeNo,
      prepay.prepayId,
    )

    return {
      payment: updatedPayment,
      payParams: prepay.payParams,
      mode: wechatPayConfig.mode,
    }
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    orderId: string
  }
}>('/api/admin/payments/wechat/sync', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const order = await store.getAdminOrder(request.body.orderId)
    if (!order) {
      return reply.code(404).send({ error: 'order_not_found' })
    }
    if (!order.payment) {
      return reply.code(404).send({ error: 'payment_not_found' })
    }

    const transaction = await queryWechatPayTransaction(wechatPayConfig, {
      outTradeNo: order.payment.outTradeNo,
    })

    if (transaction.trade_state !== 'SUCCESS') {
      return {
        payment: order.payment,
        transaction: {
          outTradeNo: transaction.out_trade_no,
          tradeState: transaction.trade_state,
          tradeStateDesc: transaction.trade_state_desc,
        },
      }
    }

    const payment = await store.markWechatPaymentPaid({
      outTradeNo: order.payment.outTradeNo,
      transactionId: transaction.transaction_id,
      paidAmountFen: transaction.amount?.payer_total ?? transaction.amount?.total,
      paidAt: transaction.success_time,
    })
    const updatedOrder = await store.findOrder(payment.orderId)
    if (updatedOrder) {
      await notifyBestEffort(notificationService.notifyPaymentPaid(updatedOrder))
    }

    return {
      payment,
      transaction: {
        outTradeNo: transaction.out_trade_no,
        tradeState: transaction.trade_state,
        tradeStateDesc: transaction.trade_state_desc,
        successTime: transaction.success_time,
      },
    }
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    orderId: string
    amountFen?: number
    reason?: string
  }
}>('/api/admin/payments/wechat/refund', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const order = await store.getAdminOrder(request.body.orderId)
    if (!order) {
      return reply.code(404).send({ error: 'order_not_found' })
    }
    if (!order.payment || order.payment.status !== 'paid') {
      return reply.code(409).send({ error: 'payment_not_paid' })
    }

    const refund = await store.createWechatRefund({
      orderId: order.id,
      amountFen: request.body.amountFen,
      reason: request.body.reason,
    })
    const refundResult = await createWechatRefundRequest(wechatPayConfig, {
      outTradeNo: order.payment.outTradeNo,
      outRefundNo: refund.outRefundNo,
      refundAmountFen: refund.amountFen,
      totalAmountFen: order.payment.paidAmountFen ?? order.payment.amountFen,
      reason: refund.reason,
    })
    const updatedRefund = await store.updateWechatRefundStatus(refund.outRefundNo, {
      refundId: refundResult.refund_id,
      status: refundResult.status,
      successTime: refundResult.success_time,
    })

    return {
      refund: updatedRefund,
      order: await store.getAdminOrder(order.id),
      mode: wechatPayConfig.mode,
    }
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    orderId?: string
    outRefundNo?: string
  }
}>('/api/admin/payments/wechat/refund/sync', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const refund = request.body.outRefundNo
      ? await store.findWechatRefundByOutRefundNo(request.body.outRefundNo)
      : request.body.orderId
        ? await store.findLatestWechatRefundForOrder(request.body.orderId)
        : undefined
    if (!refund) {
      return reply.code(404).send({ error: 'refund_not_found' })
    }

    const refundResult = await queryWechatRefund(wechatPayConfig, {
      outRefundNo: refund.outRefundNo,
    })
    const updatedRefund = await store.updateWechatRefundStatus(refund.outRefundNo, {
      refundId: refundResult.refund_id,
      status: refundResult.status,
      successTime: refundResult.success_time,
    })

    return {
      refund: updatedRefund,
      order: await store.getAdminOrder(refund.orderId),
      mode: wechatPayConfig.mode,
    }
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    resource?: {
      associated_data: string
      nonce: string
      ciphertext: string
    }
  }
}>('/api/payments/wechat/notify', async (request, reply) => {
  if (!wechatPayConfig.apiV3Key) {
    return reply.code(500).send({ code: 'FAIL', message: 'missing_api_v3_key' })
  }
  if (!request.body.resource) {
    return reply.code(400).send({ code: 'FAIL', message: 'missing_resource' })
  }

  try {
    const notification = decryptWechatPayResource(
      wechatPayConfig.apiV3Key,
      request.body.resource,
    )

    if (notification.trade_state === 'SUCCESS') {
      const payment = await store.markWechatPaymentPaid({
        outTradeNo: notification.out_trade_no,
        transactionId: notification.transaction_id,
        paidAmountFen: notification.amount?.payer_total ?? notification.amount?.total,
        paidAt: notification.success_time,
      })
      const order = await store.findOrder(payment.orderId)
      if (order) {
        await notifyBestEffort(notificationService.notifyPaymentPaid(order))
      }
    }

    return {
      code: 'SUCCESS',
      message: '成功',
    }
  } catch (error) {
    app.log.error({ error }, 'Failed to handle WeChat Pay notification')
    return reply.code(500).send({ code: 'FAIL', message: 'notify_failed' })
  }
})

app.post<{
  Body: {
    resource?: {
      associated_data: string
      nonce: string
      ciphertext: string
    }
  }
}>('/api/payments/wechat/refund-notify', async (request, reply) => {
  if (!wechatPayConfig.apiV3Key) {
    return reply.code(500).send({ code: 'FAIL', message: 'missing_api_v3_key' })
  }
  if (!request.body.resource) {
    return reply.code(400).send({ code: 'FAIL', message: 'missing_resource' })
  }

  try {
    const notification = decryptWechatPayResource(
      wechatPayConfig.apiV3Key,
      request.body.resource,
    )

    if (notification.out_refund_no && notification.refund_status) {
      await store.updateWechatRefundStatus(notification.out_refund_no, {
        refundId: notification.refund_id,
        status: notification.refund_status,
        successTime: notification.success_time,
      })
    }

    return {
      code: 'SUCCESS',
      message: '成功',
    }
  } catch (error) {
    app.log.error({ error }, 'Failed to handle WeChat Pay refund notification')
    return reply.code(500).send({ code: 'FAIL', message: 'refund_notify_failed' })
  }
})

app.post('/api/dev/reset', async (_request, reply) => {
  if (!runtimeAllowsDevEndpoints) {
    return reply.code(404).send({ error: 'not_found' })
  }
  await store.resetDemoData()
  const [orders, escorts] = await Promise.all([
    store.listAdminOrders({}),
    store.listEscorts(),
  ])

  return {
    ok: true,
    orders: orders.length,
    escorts: escorts.length,
  }
})

app.post<{
  Body: {
    orderId: string
  }
}>('/api/dev/payments/wechat/mock-success', async (request, reply) => {
  if (!runtimeAllowsDevEndpoints) {
    return reply.code(404).send({ error: 'not_found' })
  }

  try {
    const payment = await store.markWechatPaymentPaidByOrderId({
      orderId: request.body.orderId,
      transactionId: `mock_tx_${Date.now()}`,
    })
    const order = await store.findOrder(payment.orderId)
    if (order) {
      await notifyBestEffort(notificationService.notifyPaymentPaid(order))
    }

    return {
      ok: true,
      payment,
    }
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Body: {
    hospitalName: string
    departmentName?: string
    visitDate: string
    visitTime: string
    servicePackage: ServicePackageKey
    contactName: string
    contactPhone: string
    elderRelation: string
    specialNotes?: string
  }
}>('/api/orders', async (request, reply) => {
  try {
    const actor = actorFromRequest(request)
    const createdOrder = await store.createOrder(request.body, { userId: actor.userId })
    const order = await store.findOrder(createdOrder.orderId)
    if (order) {
      await notifyBestEffort(notificationService.notifyOrderCreated(order))
    }
    return reply.code(201).send(createdOrder)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.get('/api/my/orders', async (request) => ({
  orders: await store.listMyOrders(actorFromRequest(request).userId),
}))

app.get<{ Params: { orderId: string } }>('/api/my/orders/:orderId', async (request, reply) => {
  const order = await store.findOrderForUser(
    request.params.orderId,
    actorFromRequest(request).userId,
  )
  if (!order) {
    return reply.code(404).send({ error: 'order_not_found' })
  }

  return order
})

app.get<{
  Querystring: {
    status?: OrderStatus
    keyword?: string
  }
}>('/api/admin/orders', async (request, reply) => {
  if (!requireRole(request, reply, 'admin')) {
    return reply
  }

  return {
    orders: await store.listAdminOrders(request.query),
  }
})

app.get<{ Params: { orderId: string } }>('/api/admin/orders/:orderId', async (request, reply) => {
  if (!requireRole(request, reply, 'admin')) {
    return reply
  }

  const order = await store.getAdminOrder(request.params.orderId)
  if (!order) {
    return reply.code(404).send({ error: 'order_not_found' })
  }

  return order
})

app.post<{
  Params: { orderId: string }
  Body: {
    customerServiceNote?: string
    estimatedPrice?: number
  }
}>('/api/admin/orders/:orderId/confirm', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const order = await store.confirmOrder(request.params.orderId, request.body)
    await notifyBestEffort(notificationService.notifyOrderConfirmed(order))
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.patch<{
  Params: { orderId: string }
  Body: {
    hospitalName?: string
    departmentName?: string
    visitDate?: string
    visitTime?: string
    servicePackage?: ServicePackageKey
    contactName?: string
    contactPhone?: string
    elderRelation?: string
    specialNotes?: string
    customerServiceNote?: string
    estimatedPrice?: number
  }
}>('/api/admin/orders/:orderId', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.updateAdminOrder(request.params.orderId, request.body)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: { reason: string }
}>('/api/admin/orders/:orderId/cancel', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.cancelOrder(request.params.orderId, request.body.reason)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: { reason: string }
}>('/api/admin/orders/:orderId/unavailable', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.markUnavailable(request.params.orderId, request.body.reason)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: { escortId: string }
}>('/api/admin/orders/:orderId/assign', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const order = await store.assignOrder(request.params.orderId, request.body.escortId)
    await notifyBestEffort(notificationService.notifyOrderAssigned(order))
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.get('/api/admin/escorts', async (request, reply) => {
  if (!requireRole(request, reply, 'admin')) {
    return reply
  }

  return {
    escorts: await store.listEscorts(),
  }
})

app.post<{
  Body: {
    name: string
    phone: string
    familiarHospitals: string[]
    status?: EscortStatus
  }
}>('/api/admin/escorts', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.createEscort(request.body)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.patch<{
  Params: { escortId: string }
  Body: {
    name?: string
    phone?: string
    familiarHospitals?: string[]
    status?: EscortStatus
  }
}>('/api/admin/escorts/:escortId', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.updateEscort(request.params.escortId, request.body)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { escortId: string }
  Body: {
    status: EscortStatus
  }
}>('/api/admin/escorts/:escortId/status', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.updateEscortStatus(request.params.escortId, request.body.status)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.get('/api/admin/escort-access-codes', async (request, reply) => {
  if (!requireRole(request, reply, 'admin')) {
    return reply
  }

  return {
    accessCodes: await store.listEscortAccessCodes(),
  }
})

app.post<{
  Body: {
    name: string
    escortId: string
    accessCode: string
    phone?: string
    note?: string
  }
}>('/api/admin/escort-access-codes', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.createEscortAccessCode(request.body)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { id: string }
  Body: {
    status: 'active' | 'disabled'
  }
}>('/api/admin/escort-access-codes/:id/status', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.updateEscortAccessCodeStatus(
      request.params.id,
      request.body.status,
    )
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.get('/api/admin/notifications', async (request, reply) => {
  if (!requireRole(request, reply, 'admin')) {
    return reply
  }

  return {
    notifications: await store.listNotificationLogs(),
  }
})

app.post<{
  Params: { orderId: string }
  Body: {
    stepKey: ProgressStepKey
    note?: string
    imageUrls?: string[]
  }
}>('/api/admin/orders/:orderId/progress', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const order = await store.updateProgress(request.params.orderId, request.body)
    const step = progressStepList.find((item) => item.key === request.body.stepKey)
    await notifyBestEffort(
      notificationService.notifyProgressUpdated(order, {
        stepKey: request.body.stepKey,
        stepLabel: step?.label ?? request.body.stepKey,
        note: request.body.note,
      }),
    )
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: {
    actualDurationMinutes: number
    visitResult: string
    followUpAdvice: string
    overtimeMinutes?: number
    operatorNote: string
  }
}>('/api/admin/orders/:orderId/summary', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    const order = await store.upsertServiceSummary(request.params.orderId, request.body, {
      actorType: 'admin',
      createdBy: 'admin',
    })
    await notifyBestEffort(
      notificationService.notifyProgressUpdated(order, {
        stepKey: 'service_finished',
        stepLabel: '服务结束',
        note: '服务总结已提交，请在订单详情查看。',
      }),
    )
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.get('/api/escort/tasks', async (request, reply) => {
  const actor = await requireEscortActor(request, reply)
  if (!actor) {
    return reply
  }

  return {
    tasks: await store.listEscortTasks(actor.escortId),
  }
})

app.post<{
  Params: { orderId: string }
  Body: {
    actualDurationMinutes: number
    visitResult: string
    followUpAdvice: string
    overtimeMinutes?: number
    operatorNote: string
  }
}>('/api/escort/tasks/:orderId/summary', async (request, reply) => {
  try {
    const actor = await requireEscortActor(request, reply)
    if (!actor?.escortId) {
      return reply
    }

    const order = await store.upsertServiceSummary(request.params.orderId, request.body, {
      escortId: actor.escortId,
      actorType: 'escort',
      createdBy: actor.escortId,
    })
    await notifyBestEffort(
      notificationService.notifyProgressUpdated(order, {
        stepKey: 'service_finished',
        stepLabel: '服务结束',
        note: '服务总结已提交，请在订单详情查看。',
      }),
    )
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: {
    stepKey: ProgressStepKey
    note?: string
    imageUrls?: string[]
  }
}>('/api/escort/tasks/:orderId/progress', async (request, reply) => {
  try {
    const actor = await requireEscortActor(request, reply)
    if (!actor?.escortId) {
      return reply
    }

    const order = await store.updateProgress(request.params.orderId, request.body, {
      escortId: actor.escortId,
    })
    const step = progressStepList.find((item) => item.key === request.body.stepKey)
    await notifyBestEffort(
      notificationService.notifyProgressUpdated(order, {
        stepKey: request.body.stepKey,
        stepLabel: step?.label ?? request.body.stepKey,
        note: request.body.note,
      }),
    )
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: {
    exceptionType: string
    description: string
  }
}>('/api/escort/tasks/:orderId/exceptions', async (request, reply) => {
  try {
    const actor = await requireEscortActor(request, reply)
    if (!actor?.escortId) {
      return reply
    }

    const order = await store.createException(request.params.orderId, request.body, {
      escortId: actor.escortId,
    })
    await notifyBestEffort(
      notificationService.notifyExceptionCreated(order, request.body.description),
    )
    return order
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

app.post<{
  Params: { orderId: string }
  Body: {
    resolution: 'resume' | 'cancel'
    note?: string
  }
}>('/api/admin/orders/:orderId/exceptions/resolve', async (request, reply) => {
  try {
    if (!requireRole(request, reply, 'admin')) {
      return reply
    }

    return await store.resolveException(request.params.orderId, request.body)
  } catch (error) {
    return sendStoreError(reply, error)
  }
})

const port = Number(process.env.PORT ?? 5175)
const host = process.env.HOST ?? '127.0.0.1'

await app.listen({ port, host })
