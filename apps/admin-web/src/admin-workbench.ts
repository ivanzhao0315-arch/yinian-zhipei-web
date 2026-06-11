export type AdminOrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'assigned'
  | 'waiting_start'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'unavailable'
  | 'exception_handling'

export type AdminPaymentStatus = 'pending' | 'paid' | 'closed' | 'refunded' | string

export type AdminProgressItem = {
  stepKey: string
  stepLabel: string
  createdAt?: string
}

export type AdminExceptionItem = {
  handled?: boolean
}

export type AdminWorkbenchOrder = {
  id?: string
  orderNo?: string
  status: AdminOrderStatus
  visitDate?: string
  visitTime?: string
  assignedEscortId?: string
  payment?: {
    status?: AdminPaymentStatus
  }
  progress?: AdminProgressItem[]
  exceptions?: AdminExceptionItem[]
}

export type AdminWorkStageKey =
  | 'exception'
  | 'confirm'
  | 'payment'
  | 'assign'
  | 'service'
  | 'completed'
  | 'closed'

export type AdminWorkStage = {
  key: AdminWorkStageKey
  label: string
  hint: string
  priority: number
  tone: 'danger' | 'warning' | 'primary' | 'neutral' | 'muted'
}

export const adminProgressSteps = [
  { key: 'contacted_family', label: '已联系家属' },
  { key: 'departed', label: '已出发' },
  { key: 'arrived_hospital', label: '已到医院' },
  { key: 'met_elder', label: '已见到老人' },
  { key: 'checked_in', label: '已取号/签到' },
  { key: 'waiting', label: '候诊中' },
  { key: 'seeing_doctor', label: '陪同就诊' },
  { key: 'checking', label: '缴费/检查' },
  { key: 'picking_medicine', label: '取药' },
  { key: 'service_finished', label: '服务结束' },
] as const

export function hasUnhandledException(order: AdminWorkbenchOrder) {
  return order.status === 'exception_handling' || Boolean(order.exceptions?.some((item) => !item.handled))
}

export function isWaitingPayment(order: AdminWorkbenchOrder) {
  return order.status === 'confirmed' && (!order.payment || order.payment.status !== 'paid')
}

export function isWaitingAssign(order: AdminWorkbenchOrder) {
  return order.status === 'confirmed' && order.payment?.status === 'paid' && !order.assignedEscortId
}

export function isActiveService(order: AdminWorkbenchOrder) {
  return ['assigned', 'waiting_start', 'in_service', 'exception_handling'].includes(order.status)
}

export function isRiskOrder(order: AdminWorkbenchOrder) {
  return hasUnhandledException(order)
}

export function getAdminWorkStage(order: AdminWorkbenchOrder): AdminWorkStage {
  if (hasUnhandledException(order)) {
    return {
      key: 'exception',
      label: '异常处理',
      hint: '先联系陪诊员和家属',
      priority: 0,
      tone: 'danger',
    }
  }

  if (order.status === 'pending_confirmation') {
    return {
      key: 'confirm',
      label: '电话确认',
      hint: '确认需求、费用和注意事项',
      priority: 1,
      tone: 'warning',
    }
  }

  if (isWaitingPayment(order)) {
    return {
      key: 'payment',
      label: '支付核验',
      hint: '提醒家属支付或同步微信支付',
      priority: 2,
      tone: 'warning',
    }
  }

  if (isWaitingAssign(order)) {
    return {
      key: 'assign',
      label: '待派单',
      hint: '选择空闲陪诊员',
      priority: 3,
      tone: 'primary',
    }
  }

  if (isActiveService(order)) {
    return {
      key: 'service',
      label: '进度跟踪',
      hint: '关注陪诊员进度同步',
      priority: 4,
      tone: 'neutral',
    }
  }

  if (order.status === 'completed') {
    return {
      key: 'completed',
      label: '已完成',
      hint: '查看服务总结',
      priority: 9,
      tone: 'muted',
    }
  }

  return {
    key: 'closed',
    label: order.status === 'cancelled' ? '已取消' : '暂无法服务',
    hint: '保留沟通记录',
    priority: 10,
    tone: 'muted',
  }
}

export function getNextProgressStep(order: AdminWorkbenchOrder) {
  const finished = new Set(order.progress?.map((item) => item.stepKey) ?? [])
  return adminProgressSteps.find((step) => !finished.has(step.key)) ?? adminProgressSteps.at(-1)
}

export function getAdminCurrentProgressLabel(order: AdminWorkbenchOrder) {
  return [...(order.progress ?? [])].reverse()[0]?.stepLabel ?? '未开始'
}

export function getAdminProgressPercent(order: AdminWorkbenchOrder) {
  if (order.status === 'completed') return 100
  const finished = new Set(order.progress?.map((item) => item.stepKey) ?? [])
  return Math.round((adminProgressSteps.filter((step) => finished.has(step.key)).length / adminProgressSteps.length) * 100)
}

export function getAdminNextAction(order: AdminWorkbenchOrder) {
  if (hasUnhandledException(order)) return '运营介入：联系陪诊员/家属，记录处理结果'
  if (order.status === 'pending_confirmation') return '电话确认医院科室、就诊时间、费用边界'
  if (order.status === 'confirmed' && !order.payment) return '等待家属发起支付，必要时提醒'
  if (order.status === 'confirmed' && order.payment?.status !== 'paid') return '同步微信支付，确认已支付后派单'
  if (isWaitingAssign(order)) return '选择空闲陪诊员派单'
  if (order.status === 'assigned') return '提醒陪诊员联系家属并开始进度同步'
  if (order.status === 'waiting_start') return '等待陪诊员到达医院'
  if (order.status === 'in_service') return `推进：${getNextProgressStep(order)?.label ?? '服务完成'}`
  if (order.status === 'completed') return '查看服务总结和售后'
  if (order.status === 'cancelled') return '订单已取消，无需继续处理'
  if (order.status === 'unavailable') return '暂无法服务，保留沟通记录'
  return `推进：${getNextProgressStep(order)?.label ?? '服务完成'}`
}

export function sortAdminWorkQueue<T extends AdminWorkbenchOrder>(orders: T[]) {
  return orders
    .filter((order) => getAdminWorkStage(order).priority <= 4)
    .sort((a, b) => {
      const stageDiff = getAdminWorkStage(a).priority - getAdminWorkStage(b).priority
      if (stageDiff !== 0) return stageDiff

      const timeDiff = parseVisitTime(a) - parseVisitTime(b)
      if (timeDiff !== 0) return timeDiff

      return (a.orderNo ?? a.id ?? '').localeCompare(b.orderNo ?? b.id ?? '')
    })
}

function parseVisitTime(order: AdminWorkbenchOrder) {
  const value = `${order.visitDate ?? ''}T${order.visitTime ?? '23:59'}`
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
}
