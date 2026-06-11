import { orderStatusLabels, type OrderStatus, type ProgressStepKey } from '@yinian-zhipei/shared'
import type { WechatPayConfig } from './wechat-pay.js'

type NotificationMode = 'mock' | 'live'

type NotificationEvent =
  | 'order_created'
  | 'order_confirmed'
  | 'payment_paid'
  | 'family_order_assigned'
  | 'escort_order_assigned'
  | 'progress_updated'
  | 'exception_created'

type NotificationRecipient = 'family' | 'escort'

type NotificationLogInput = {
  orderId?: string
  event: NotificationEvent
  recipientType: NotificationRecipient
  recipientId: string
  channel: 'wechat_subscribe'
  templateId?: string
  status: 'mocked' | 'sent' | 'skipped' | 'failed'
  payload: unknown
  errorMessage?: string
}

type NotificationStore = {
  getFamilyOpenIdByUserId(userId: string): Promise<string | undefined>
  getEscortOpenIdByEscortId(escortId: string): Promise<string | undefined>
  createNotificationLog(input: NotificationLogInput): Promise<void>
}

type NotificationConfig = {
  mode: NotificationMode
  miniprogramState: 'developer' | 'trial' | 'formal'
  templateIds: Partial<Record<NotificationEvent, string>>
}

type PublicOrder = {
  id: string
  orderNo: string
  userId: string
  hospitalName: string
  visitDate: string
  visitTime: string
  estimatedPrice: number
  status: string
  assignedEscortId?: string
  escort?: {
    id: string
    name: string
  }
}

type ProgressPayload = {
  stepKey: ProgressStepKey
  stepLabel: string
  note?: string
}

const WECHAT_ACCESS_TOKEN_API = 'https://api.weixin.qq.com/cgi-bin/token'
const WECHAT_SUBSCRIBE_SEND_API =
  'https://api.weixin.qq.com/cgi-bin/message/subscribe/send'

const value = (name: string) => process.env[name]?.trim()

export const loadNotificationConfig = (): NotificationConfig => ({
  mode: process.env.WECHAT_NOTIFY_MODE === 'live' ? 'live' : 'mock',
  miniprogramState:
    process.env.WECHAT_NOTIFY_MINIPROGRAM_STATE === 'formal' ||
    process.env.WECHAT_NOTIFY_MINIPROGRAM_STATE === 'trial'
      ? process.env.WECHAT_NOTIFY_MINIPROGRAM_STATE
      : 'developer',
  templateIds: {
    order_created: value('WECHAT_NOTIFY_TEMPLATE_ORDER_CREATED'),
    order_confirmed: value('WECHAT_NOTIFY_TEMPLATE_ORDER_CONFIRMED'),
    payment_paid: value('WECHAT_NOTIFY_TEMPLATE_PAYMENT_PAID'),
    family_order_assigned: value('WECHAT_NOTIFY_TEMPLATE_FAMILY_ASSIGNED'),
    escort_order_assigned: value('WECHAT_NOTIFY_TEMPLATE_ESCORT_ASSIGNED'),
    progress_updated: value('WECHAT_NOTIFY_TEMPLATE_PROGRESS_UPDATED'),
    exception_created: value('WECHAT_NOTIFY_TEMPLATE_EXCEPTION_CREATED'),
  },
})

const trimText = (text: string, maxLength = 20) =>
  text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text

const templateData = (order: PublicOrder, event: NotificationEvent, extra?: ProgressPayload) => {
  const orderNo = order.orderNo
  const hospital = trimText(order.hospitalName)
  const visitTime = `${order.visitDate} ${order.visitTime}`
  const status = trimText(orderStatusLabels[order.status as OrderStatus] ?? event, 10)
  const amount = `${order.estimatedPrice}元`
  const operator = trimText(extra?.stepLabel ?? order.escort?.name ?? '颐年智陪')
  const remark = trimText(extra?.note ?? '请进入小程序查看详情')

  return {
    character_string1: { value: orderNo },
    character_string2: { value: orderNo },
    character_string3: { value: orderNo },
    thing1: { value: hospital },
    thing2: { value: hospital },
    thing3: { value: operator },
    thing4: { value: remark },
    thing5: { value: hospital },
    thing6: { value: operator },
    thing7: { value: remark },
    thing8: { value: remark },
    thing9: { value: hospital },
    thing10: { value: operator },
    thing11: { value: remark },
    thing12: { value: hospital },
    thing13: { value: operator },
    thing14: { value: remark },
    thing15: { value: hospital },
    thing16: { value: hospital },
    thing17: { value: operator },
    thing18: { value: remark },
    thing19: { value: hospital },
    thing20: { value: remark },
    time1: { value: visitTime },
    time2: { value: visitTime },
    time3: { value: visitTime },
    time4: { value: visitTime },
    time5: { value: visitTime },
    date2: { value: order.visitDate },
    date3: { value: order.visitDate },
    date4: { value: order.visitDate },
    date5: { value: order.visitDate },
    phrase1: { value: status },
    phrase2: { value: status },
    phrase3: { value: status },
    phrase4: { value: status },
    amount1: { value: amount },
    amount2: { value: amount },
    amount5: { value: amount },
  }
}

export class NotificationService {
  private accessToken?: {
    token: string
    expiresAt: number
  }

  constructor(
    private readonly store: NotificationStore,
    private readonly wechatConfig: WechatPayConfig,
    private readonly notificationConfig: NotificationConfig,
  ) {}

  async notifyOrderCreated(order: PublicOrder) {
    await this.sendFamily(order, 'order_created')
  }

  async notifyOrderConfirmed(order: PublicOrder) {
    await this.sendFamily(order, 'order_confirmed')
  }

  async notifyPaymentPaid(order: PublicOrder) {
    await this.sendFamily(order, 'payment_paid')
  }

  async notifyOrderAssigned(order: PublicOrder) {
    await Promise.all([
      this.sendFamily(order, 'family_order_assigned'),
      this.sendEscort(order, 'escort_order_assigned'),
    ])
  }

  async notifyProgressUpdated(order: PublicOrder, progress: ProgressPayload) {
    await this.sendFamily(order, 'progress_updated', progress)
  }

  async notifyExceptionCreated(order: PublicOrder, description: string) {
    await this.sendFamily(order, 'exception_created', {
      stepKey: 'seeing_doctor',
      stepLabel: '异常处理中',
      note: description,
    })
  }

  familyTemplateIds() {
    return [
      ...this.familyOrderTemplateIds(),
      ...this.familyServiceTemplateIds(),
    ]
  }

  familyOrderTemplateIds() {
    return [
      this.notificationConfig.templateIds.order_created,
      this.notificationConfig.templateIds.order_confirmed,
      this.notificationConfig.templateIds.family_order_assigned,
    ].filter((templateId): templateId is string => Boolean(templateId))
  }

  familyServiceTemplateIds() {
    return [
      this.notificationConfig.templateIds.payment_paid,
      this.notificationConfig.templateIds.progress_updated,
      this.notificationConfig.templateIds.exception_created,
    ].filter((templateId): templateId is string => Boolean(templateId))
  }

  escortTemplateIds() {
    return [
      this.notificationConfig.templateIds.escort_order_assigned,
    ].filter((templateId): templateId is string => Boolean(templateId))
  }

  private async sendFamily(
    order: PublicOrder,
    event: NotificationEvent,
    extra?: ProgressPayload,
  ) {
    const openId = await this.store.getFamilyOpenIdByUserId(order.userId)
    if (!openId) {
      await this.logSkipped(order, event, 'family', order.userId, 'missing_family_openid')
      return
    }

    await this.sendWechatSubscribe({
      order,
      event,
      extra,
      recipientType: 'family',
      recipientId: order.userId,
      openId,
    })
  }

  private async sendEscort(
    order: PublicOrder,
    event: NotificationEvent,
    extra?: ProgressPayload,
  ) {
    if (!order.assignedEscortId) {
      await this.logSkipped(order, event, 'escort', 'unassigned', 'missing_escort')
      return
    }

    const openId = await this.store.getEscortOpenIdByEscortId(order.assignedEscortId)
    if (!openId) {
      await this.logSkipped(
        order,
        event,
        'escort',
        order.assignedEscortId,
        'missing_escort_openid',
      )
      return
    }

    await this.sendWechatSubscribe({
      order,
      event,
      extra,
      recipientType: 'escort',
      recipientId: order.assignedEscortId,
      openId,
    })
  }

  private async sendWechatSubscribe(input: {
    order: PublicOrder
    event: NotificationEvent
    extra?: ProgressPayload
    recipientType: NotificationRecipient
    recipientId: string
    openId: string
  }) {
    const templateId = this.notificationConfig.templateIds[input.event]
    const payload = {
      touser: input.openId,
      template_id: templateId,
      page: `pages/orders/index`,
      miniprogram_state: this.notificationConfig.miniprogramState,
      lang: 'zh_CN',
      data: templateData(input.order, input.event, input.extra),
    }

    if (this.notificationConfig.mode === 'mock' || !templateId) {
      await this.store.createNotificationLog({
        orderId: input.order.id,
        event: input.event,
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        channel: 'wechat_subscribe',
        templateId,
        status: templateId ? 'mocked' : 'skipped',
        payload,
        errorMessage: templateId ? undefined : 'missing_template_id',
      })
      return
    }

    try {
      const accessToken = await this.getAccessToken()
      const url = new URL(WECHAT_SUBSCRIBE_SEND_API)
      url.searchParams.set('access_token', accessToken)
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { errcode?: number; errmsg?: string }
      const ok = response.ok && (!result.errcode || result.errcode === 0)

      await this.store.createNotificationLog({
        orderId: input.order.id,
        event: input.event,
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        channel: 'wechat_subscribe',
        templateId,
        status: ok ? 'sent' : 'failed',
        payload: { ...payload, result },
        errorMessage: ok ? undefined : result.errmsg ?? `wechat_notify_failed_${result.errcode}`,
      })
    } catch (error) {
      await this.store.createNotificationLog({
        orderId: input.order.id,
        event: input.event,
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        channel: 'wechat_subscribe',
        templateId,
        status: 'failed',
        payload,
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  private async getAccessToken() {
    const cached = this.accessToken
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token
    }

    const appId = this.wechatConfig.appIds[0]
    const secret = this.wechatConfig.appSecrets[appId]
    if (!appId || !secret) {
      throw new Error('missing_wechat_app_secret')
    }

    const url = new URL(WECHAT_ACCESS_TOKEN_API)
    url.searchParams.set('grant_type', 'client_credential')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', secret)
    const response = await fetch(url)
    const data = (await response.json()) as {
      access_token?: string
      expires_in?: number
      errcode?: number
      errmsg?: string
    }

    if (!response.ok || !data.access_token) {
      throw new Error(`wechat_access_token_failed_${data.errcode ?? response.status}`)
    }

    this.accessToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    }
    return data.access_token
  }

  private async logSkipped(
    order: PublicOrder,
    event: NotificationEvent,
    recipientType: NotificationRecipient,
    recipientId: string,
    errorMessage: string,
  ) {
    await this.store.createNotificationLog({
      orderId: order.id,
      event,
      recipientType,
      recipientId,
      channel: 'wechat_subscribe',
      status: 'skipped',
      payload: { orderId: order.id, orderNo: order.orderNo },
      errorMessage,
    })
  }
}

export type { NotificationLogInput }
