import {
  Activity,
  BellRing,
  CalendarClock,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  History,
  Hospital,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  PhoneCall,
  RefreshCw,
  Settings,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  adminProgressSteps as progressSteps,
  getAdminCurrentProgressLabel,
  getAdminNextAction,
  getAdminProgressPercent,
  getAdminWorkStage,
  getNextProgressStep,
  isActiveService,
  isRiskOrder,
  isWaitingAssign,
  isWaitingPayment,
  sortAdminWorkQueue,
} from './admin-workbench'

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://127.0.0.1:5175' : '')
const ADMIN_SESSION_STORAGE_KEY = 'yinian-zhipei-admin-session'
const showDevTools = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_TOOLS === 'true'

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'assigned'
  | 'waiting_start'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'unavailable'
  | 'exception_handling'

type ServicePackageKey = 'single_task' | 'half_day' | 'full_day'

type OrderProgress = {
  id: string
  stepKey: string
  stepLabel: string
  note?: string
  createdAt: string
}

type OrderException = {
  id: string
  exceptionType: string
  description: string
  handled: boolean
  resolution?: string
  createdAt: string
}

type ServiceSummary = {
  id: string
  actualDurationMinutes: number
  visitResult: string
  followUpAdvice: string
  overtimeMinutes: number
  operatorNote: string
  createdAt: string
}

type PaymentStatus = 'pending' | 'paid' | 'closed' | 'refunded'

type PaymentInfo = {
  id: string
  outTradeNo: string
  amountFen: number
  paidAmountFen?: number
  status: PaymentStatus
  transactionId?: string
  paidAt?: string
}

type RefundStatus = 'pending' | 'processing' | 'success' | 'closed' | 'abnormal'

type RefundInfo = {
  id: string
  outRefundNo: string
  refundId?: string
  amountFen: number
  status: RefundStatus
  reason?: string
  successTime?: string
  createdAt: string
  updatedAt: string
}

type AdminSession = {
  admin: {
    role: 'admin'
    userId: string
    username: string
    displayName: string
  }
  token: string
  expiresAt: string
}

type Escort = {
  id: string
  name: string
  phone: string
  familiarHospitals: string[]
  status: 'available' | 'busy' | 'off'
}

type EscortWhitelistItem = {
  id: string
  phone: string
  escortId?: string
  accessCode?: string
  name: string
  status: 'active' | 'disabled'
  note?: string
  createdAt: string
  updatedAt: string
}

type NotificationLog = {
  id: string
  orderId?: string
  event: string
  recipientType: string
  recipientId: string
  channel: string
  templateId?: string
  status: string
  errorMessage?: string
  createdAt: string
}

type HealthInfo = {
  ok: boolean
  service: string
  persistence: string
}

type Order = {
  id: string
  orderNo: string
  hospitalName: string
  departmentName?: string
  visitDate: string
  visitTime: string
  servicePackage: ServicePackageKey
  estimatedPrice: number
  contactName: string
  contactPhone: string
  elderRelation: string
  specialNotes?: string
  status: OrderStatus
  assignedEscortId?: string
  customerServiceNote?: string
  escort?: Escort
  progress: OrderProgress[]
  exceptions: OrderException[]
  payment?: PaymentInfo
  refund?: RefundInfo
  refunds?: RefundInfo[]
  serviceSummary?: ServiceSummary
}

type AdminView = 'dashboard' | 'orders' | 'escorts' | 'logs' | 'settings'
type OrderFilter = OrderStatus | 'all' | 'risk' | 'waiting_payment' | 'waiting_assign' | 'active_service'

type EscortFormState = {
  name: string
  phone: string
  familiarHospitals: string
  status: Escort['status']
}

type OrderFormState = {
  hospitalName: string
  departmentName: string
  visitDate: string
  visitTime: string
  servicePackage: ServicePackageKey
  estimatedPrice: string
  contactName: string
  contactPhone: string
  elderRelation: string
  specialNotes: string
  customerServiceNote: string
}

type RefundFormState = {
  amountYuan: string
  reason: string
}

type ServiceSummaryFormState = {
  actualDurationMinutes: string
  visitResult: string
  followUpAdvice: string
  overtimeMinutes: string
  operatorNote: string
}

const emptyEscortForm: EscortFormState = {
  name: '',
  phone: '',
  familiarHospitals: '',
  status: 'available',
}

const emptyOrderForm: OrderFormState = {
  hospitalName: '',
  departmentName: '',
  visitDate: '',
  visitTime: '',
  servicePackage: 'half_day',
  estimatedPrice: '',
  contactName: '',
  contactPhone: '',
  elderRelation: '',
  specialNotes: '',
  customerServiceNote: '',
}

const emptyRefundForm: RefundFormState = {
  amountYuan: '',
  reason: '',
}

const emptyServiceSummaryForm: ServiceSummaryFormState = {
  actualDurationMinutes: '',
  visitResult: '',
  followUpAdvice: '',
  overtimeMinutes: '0',
  operatorNote: '',
}

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    progress: order.progress ?? [],
    exceptions: order.exceptions ?? [],
    refunds: order.refunds ?? [],
  }
}

function orderToForm(order?: Order): OrderFormState {
  if (!order) return emptyOrderForm
  return {
    hospitalName: order.hospitalName,
    departmentName: order.departmentName ?? '',
    visitDate: order.visitDate,
    visitTime: order.visitTime,
    servicePackage: order.servicePackage,
    estimatedPrice: String(order.estimatedPrice),
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    elderRelation: order.elderRelation,
    specialNotes: order.specialNotes ?? '',
    customerServiceNote: order.customerServiceNote ?? '',
  }
}

function orderToSummaryForm(order?: Order): ServiceSummaryFormState {
  if (!order) return emptyServiceSummaryForm
  const defaultDuration = order.servicePackage === 'full_day' ? 480 : order.servicePackage === 'half_day' ? 240 : 90
  return {
    actualDurationMinutes: String(order.serviceSummary?.actualDurationMinutes ?? defaultDuration),
    visitResult: order.serviceSummary?.visitResult ?? '',
    followUpAdvice: order.serviceSummary?.followUpAdvice ?? '',
    overtimeMinutes: String(order.serviceSummary?.overtimeMinutes ?? 0),
    operatorNote: order.serviceSummary?.operatorNote ?? '',
  }
}

const statusText: Record<OrderStatus, string> = {
  pending_confirmation: '待电话确认',
  confirmed: '已确认',
  assigned: '已派单',
  waiting_start: '等待服务',
  in_service: '陪诊中',
  completed: '已完成',
  cancelled: '已取消',
  unavailable: '暂无法服务',
  exception_handling: '异常处理中',
}

const serviceText: Record<ServicePackageKey, string> = {
  single_task: '单项代办/陪同',
  half_day: '半日陪诊',
  full_day: '全日陪诊',
}

const statusOrder: OrderStatus[] = [
  'pending_confirmation',
  'confirmed',
  'assigned',
  'in_service',
  'exception_handling',
  'completed',
]

const escortStatusText: Record<Escort['status'], string> = {
  available: '空闲',
  busy: '服务中',
  off: '休息',
}

const paymentStatusText: Record<PaymentStatus | 'unpaid', string> = {
  unpaid: '未发起支付',
  pending: '待支付',
  paid: '已支付',
  closed: '已关闭',
  refunded: '已退款',
}

const refundStatusText: Record<RefundStatus, string> = {
  pending: '待提交',
  processing: '退款处理中',
  success: '退款成功',
  closed: '退款关闭',
  abnormal: '退款异常',
}

function formatFen(amountFen?: number) {
  if (amountFen === undefined) return '未记录'
  return `¥${(amountFen / 100).toFixed(2)}`
}

function formatDateTime(value?: string) {
  if (!value) return '未记录'
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

type ApiRequestOptions = RequestInit & {
  session?: AdminSession | null
}

function readStoredSession() {
  const rawSession = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY)
  if (!rawSession) return null

  try {
    const session = JSON.parse(rawSession) as AdminSession
    if (!session.token || Date.parse(session.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY)
    return null
  }
}

function storeSession(session: AdminSession) {
  window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session))
}

function clearStoredSession() {
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY)
}

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  try {
    const parsed = JSON.parse(error.message) as { error?: string }
    return parsed.error ?? error.message
  } catch {
    return error.message
  }
}

async function requestJson<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const { session, headers, ...requestOptions } = options ?? {}
  const requestHeaders = new Headers(headers)
  if (!requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  if (session?.token) {
    requestHeaders.set('Authorization', `Bearer ${session.token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...requestOptions,
    headers: requestHeaders,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(text || `Request failed: ${response.status}`, response.status)
  }

  return response.json() as Promise<T>
}

function canAssign(order?: Order) {
  return Boolean(
    (order?.status === 'confirmed' || order?.status === 'assigned') &&
    order.payment?.status === 'paid',
  )
}

function canAdvanceProgress(order?: Order) {
  return Boolean(
    order?.assignedEscortId &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    order.status !== 'exception_handling',
  )
}

function notificationStatusText(status: string) {
  if (status === 'sent') return '已发送'
  if (status === 'skipped') return '已跳过'
  if (status === 'failed') return '失败'
  return status
}

function parseEscortHospitals(value: string) {
  return Array.from(new Set(
    value
      .split(/[\n,，、/]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ))
}

function App() {
  const [session, setSession] = useState<AdminSession | null>(() => readStoredSession())
  const [loginForm, setLoginForm] = useState({
    username: 'admin',
    password: '',
  })
  const [loginLoading, setLoginLoading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [escorts, setEscorts] = useState<Escort[]>([])
  const [escortWhitelist, setEscortWhitelist] = useState<EscortWhitelistItem[]>([])
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([])
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [whitelistForm, setWhitelistForm] = useState({
    name: '',
    escortId: '',
    accessCode: '',
    note: '',
  })
  const [escortForm, setEscortForm] = useState<EscortFormState>(emptyEscortForm)
  const [editingEscortId, setEditingEscortId] = useState<string | null>(null)
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm)
  const [cancelReason, setCancelReason] = useState('')
  const [refundForm, setRefundForm] = useState<RefundFormState>(emptyRefundForm)
  const [serviceSummaryForm, setServiceSummaryForm] = useState<ServiceSummaryFormState>(emptyServiceSummaryForm)
  const [activeView, setActiveView] = useState<AdminView>('dashboard')
  const [selectedStatus, setSelectedStatus] = useState<OrderFilter>('pending_confirmation')
  const [selectedOrderId, setSelectedOrderId] = useState<string>()
  const [orderQuery, setOrderQuery] = useState('')
  const [loading, setLoading] = useState(Boolean(session))
  const [message, setMessage] = useState(session ? '正在连接 API' : '请先登录后台')

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0]
  const selectedOrderStage = selectedOrder ? getAdminWorkStage(selectedOrder) : undefined

  useEffect(() => {
    setOrderForm(orderToForm(selectedOrder))
    setCancelReason('')
    setRefundForm({
      amountYuan: selectedOrder?.payment
        ? ((selectedOrder.payment.paidAmountFen ?? selectedOrder.payment.amountFen) / 100).toFixed(2)
        : '',
      reason: selectedOrder?.refund?.reason ?? '家属取消陪诊',
    })
    setServiceSummaryForm(orderToSummaryForm(selectedOrder))
  }, [selectedOrder?.id])

  const filteredOrders = useMemo(() => {
    if (selectedStatus === 'all') return orders
    if (selectedStatus === 'risk') return orders.filter(isRiskOrder)
    if (selectedStatus === 'waiting_payment') return orders.filter(isWaitingPayment)
    if (selectedStatus === 'waiting_assign') return orders.filter(isWaitingAssign)
    if (selectedStatus === 'active_service') return orders.filter(isActiveService)
    return orders.filter((order) => order.status === selectedStatus)
  }, [orders, selectedStatus])

  const visibleOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase()
    if (!query) return filteredOrders

    return filteredOrders.filter((order) => [
      order.orderNo,
      order.hospitalName,
      order.departmentName ?? '',
      order.contactName,
      order.contactPhone,
      order.elderRelation,
      order.escort?.name ?? '',
      statusText[order.status],
      paymentStatusText[order.payment?.status ?? 'unpaid'],
      getAdminWorkStage(order).label,
    ].join(' ').toLowerCase().includes(query))
  }, [filteredOrders, orderQuery])

  const counts = useMemo(() => {
    return statusOrder.map((status) => ({
      status,
      count: orders.filter((order) => order.status === status).length,
    }))
  }, [orders])

  const riskOrders = useMemo(() => orders.filter(isRiskOrder), [orders])

  const waitingPaymentOrders = useMemo(() => orders.filter(isWaitingPayment), [orders])
  const waitingAssignOrders = useMemo(() => orders.filter(isWaitingAssign), [orders])

  const escortLoads = useMemo(() => {
    return escorts.map((escort) => {
      const activeOrders = orders.filter((order) => (
        order.assignedEscortId === escort.id &&
        !['completed', 'cancelled', 'unavailable'].includes(order.status)
      ))

      return {
        escort,
        activeOrders,
      }
    })
  }, [escorts, orders])

  const activeServiceOrders = useMemo(() => orders.filter(isActiveService), [orders])

  const workQueue = useMemo(() => {
    return sortAdminWorkQueue(orders)
  }, [orders])

  const recentProgress = useMemo(() => {
    return orders
      .flatMap((order) => order.progress.map((item) => ({ ...item, order })))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 8)
  }, [orders])

  const handleRequestError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      clearStoredSession()
      setSession(null)
      setMessage('登录已过期，请重新登录')
      return
    }
    setMessage(readableError(error, fallback))
  }

  const loginAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginLoading(true)
    setMessage('正在登录后台')
    try {
      const nextSession = await requestJson<AdminSession>('/api/admin/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      storeSession(nextSession)
      setSession(nextSession)
      setMessage(`已登录：${nextSession.admin.displayName}`)
    } catch (error) {
      setMessage(readableError(error, '登录失败'))
    } finally {
      setLoginLoading(false)
    }
  }

  const logoutAdmin = () => {
    clearStoredSession()
    setSession(null)
    setOrders([])
    setEscorts([])
    setEscortWhitelist([])
    setNotificationLogs([])
    setHealth(null)
    setEscortForm(emptyEscortForm)
    setEditingEscortId(null)
    setMessage('已退出后台')
  }

  const loadData = async () => {
    if (!session) return
    setLoading(true)
    try {
      const [ordersData, escortsData, whitelistData, notificationsData, healthData] = await Promise.all([
        requestJson<{ orders: Order[] }>('/api/admin/orders', { session }),
        requestJson<{ escorts: Escort[] }>('/api/admin/escorts', { session }),
        requestJson<{ accessCodes: EscortWhitelistItem[] }>('/api/admin/escort-access-codes', { session }),
        requestJson<{ notifications: NotificationLog[] }>('/api/admin/notifications', { session }),
        requestJson<HealthInfo>('/health'),
      ])
      const normalizedOrders = ordersData.orders.map(normalizeOrder)
      setOrders(normalizedOrders)
      setEscorts(escortsData.escorts)
      setEscortWhitelist(whitelistData.accessCodes)
      setNotificationLogs(notificationsData.notifications)
      setHealth(healthData)
      setSelectedOrderId((current) => current ?? normalizedOrders[0]?.id)
      setMessage(`已同步 ${normalizedOrders.length} 个订单`)
    } catch (error) {
      handleRequestError(error, 'API 连接失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setLoading(false)
      return
    }
    void loadData()
  }, [session])

  const confirmOrder = async () => {
    if (!selectedOrder) return
    const estimatedPrice = Number(orderForm.estimatedPrice)
    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}/confirm`, {
        session,
        method: 'POST',
        body: JSON.stringify({
          customerServiceNote: orderForm.customerServiceNote || '已电话确认，费用边界已说明',
          estimatedPrice: Number.isFinite(estimatedPrice) ? estimatedPrice : selectedOrder.estimatedPrice,
        }),
      })
      await loadData()
      setSelectedStatus('confirmed')
    } catch (error) {
      handleRequestError(error, '确认订单失败')
    }
  }

  const saveOrderEdits = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!selectedOrder) return
    const estimatedPrice = Number(orderForm.estimatedPrice)
    if (!orderForm.hospitalName.trim() || !orderForm.visitDate.trim() || !orderForm.visitTime.trim()) {
      setMessage('请填写医院和预约时间')
      return
    }
    if (!Number.isFinite(estimatedPrice) || estimatedPrice < 0) {
      setMessage('请输入有效价格')
      return
    }

    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}`, {
        session,
        method: 'PATCH',
        body: JSON.stringify({
          hospitalName: orderForm.hospitalName,
          departmentName: orderForm.departmentName,
          visitDate: orderForm.visitDate,
          visitTime: orderForm.visitTime,
          servicePackage: orderForm.servicePackage,
          estimatedPrice,
          contactName: orderForm.contactName,
          contactPhone: orderForm.contactPhone,
          elderRelation: orderForm.elderRelation,
          specialNotes: orderForm.specialNotes,
          customerServiceNote: orderForm.customerServiceNote,
        }),
      })
      await loadData()
      setMessage('订单信息已保存')
    } catch (error) {
      handleRequestError(error, '保存订单失败')
    }
  }

  const cancelSelectedOrder = async () => {
    if (!selectedOrder) return
    if (!cancelReason.trim()) {
      setMessage('请填写取消原因')
      return
    }
    if (!window.confirm('确认取消这个订单？取消后如需重新服务，需要重新下单。')) {
      return
    }

    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}/cancel`, {
        session,
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      })
      await loadData()
      setSelectedStatus('all')
      setMessage('订单已取消')
    } catch (error) {
      handleRequestError(error, '取消订单失败')
    }
  }

  const assignOrder = async (escort: Escort) => {
    if (!selectedOrder) return
    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}/assign`, {
        session,
        method: 'POST',
        body: JSON.stringify({ escortId: escort.id }),
      })
      await loadData()
      setSelectedStatus('assigned')
    } catch (error) {
      handleRequestError(error, '派单失败')
    }
  }

  const advanceProgress = async () => {
    if (!selectedOrder) return
    if (!selectedOrder.assignedEscortId) return
    const step = getNextProgressStep(selectedOrder)
    if (!step) return

    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}/progress`, {
        session,
        method: 'POST',
        body: JSON.stringify({
          stepKey: step.key,
          note: `${step.label}，运营后台更新`,
        }),
      })
      await loadData()
      setSelectedStatus(step.key === 'service_finished' ? 'completed' : 'in_service')
    } catch (error) {
      handleRequestError(error, '更新进度失败')
    }
  }

  const syncWechatPayment = async () => {
    if (!selectedOrder) return
    try {
      await requestJson<{
        order: Order
      }>('/api/admin/payments/wechat/sync', {
        session,
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrder.id }),
      })
      await loadData()
      setMessage('已同步微信支付状态')
    } catch (error) {
      handleRequestError(error, '同步微信支付失败')
    }
  }

  const requestWechatRefund = async () => {
    if (!selectedOrder?.payment || selectedOrder.payment.status !== 'paid') {
      setMessage('只有已支付订单才能发起退款')
      return
    }
    const amountFen = Math.round(Number(refundForm.amountYuan) * 100)
    if (!Number.isFinite(amountFen) || amountFen <= 0) {
      setMessage('请输入有效退款金额')
      return
    }
    if (!refundForm.reason.trim()) {
      setMessage('请填写退款原因')
      return
    }
    if (!window.confirm('确认向微信支付发起退款？该操作会影响真实资金。')) {
      return
    }

    try {
      await requestJson<{
        refund: RefundInfo
        order: Order
        mode: string
      }>('/api/admin/payments/wechat/refund', {
        session,
        method: 'POST',
        body: JSON.stringify({
          orderId: selectedOrder.id,
          amountFen,
          reason: refundForm.reason,
        }),
      })
      await loadData()
      setMessage('退款已提交，请稍后同步退款状态')
    } catch (error) {
      handleRequestError(error, '发起退款失败')
    }
  }

  const syncWechatRefund = async () => {
    if (!selectedOrder?.refund) {
      setMessage('当前订单还没有退款记录')
      return
    }

    try {
      await requestJson<{
        refund: RefundInfo
        order: Order
        mode: string
      }>('/api/admin/payments/wechat/refund/sync', {
        session,
        method: 'POST',
        body: JSON.stringify({ outRefundNo: selectedOrder.refund.outRefundNo }),
      })
      await loadData()
      setMessage('已同步退款状态')
    } catch (error) {
      handleRequestError(error, '同步退款失败')
    }
  }

  const saveServiceSummary = async () => {
    if (!selectedOrder) return
    const actualDurationMinutes = Number(serviceSummaryForm.actualDurationMinutes)
    const overtimeMinutes = Number(serviceSummaryForm.overtimeMinutes || '0')
    if (!Number.isFinite(actualDurationMinutes) || actualDurationMinutes <= 0) {
      setMessage('请填写有效服务时长')
      return
    }
    if (!Number.isFinite(overtimeMinutes) || overtimeMinutes < 0) {
      setMessage('请填写有效加时时长')
      return
    }
    if (!serviceSummaryForm.visitResult.trim() || !serviceSummaryForm.followUpAdvice.trim() || !serviceSummaryForm.operatorNote.trim()) {
      setMessage('请补齐就诊结果、后续建议和运营备注')
      return
    }

    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}/summary`, {
        session,
        method: 'POST',
        body: JSON.stringify({
          actualDurationMinutes,
          visitResult: serviceSummaryForm.visitResult,
          followUpAdvice: serviceSummaryForm.followUpAdvice,
          overtimeMinutes,
          operatorNote: serviceSummaryForm.operatorNote,
        }),
      })
      await loadData()
      setSelectedStatus('completed')
      setMessage('服务总结已保存，订单已完成')
    } catch (error) {
      handleRequestError(error, '保存服务总结失败')
    }
  }

  const resetDemoData = async () => {
    try {
      await requestJson<{ ok: boolean }>('/api/dev/reset', {
        session,
        method: 'POST',
        body: '{}',
      })
      setSelectedOrderId(undefined)
      setSelectedStatus('pending_confirmation')
      await loadData()
    } catch (error) {
      handleRequestError(error, '重置失败')
    }
  }

  const resolveException = async (resolution: 'resume' | 'cancel') => {
    if (!selectedOrder) return
    try {
      await requestJson<Order>(`/api/admin/orders/${selectedOrder.id}/exceptions/resolve`, {
        session,
        method: 'POST',
        body: JSON.stringify({
          resolution,
          note: resolution === 'resume' ? '运营已处理，继续陪诊' : '运营已处理，订单取消',
        }),
      })
      await loadData()
      setSelectedStatus(resolution === 'resume' ? 'in_service' : 'all')
    } catch (error) {
      handleRequestError(error, '处理异常失败')
    }
  }

  const addAccessCodeItem = async () => {
    if (!whitelistForm.escortId || !whitelistForm.accessCode.trim()) {
      setMessage('请选择陪诊员并填写个人口令')
      return
    }

    const selectedEscort = escorts.find((escort) => escort.id === whitelistForm.escortId)

    try {
      await requestJson<EscortWhitelistItem>('/api/admin/escort-access-codes', {
        session,
        method: 'POST',
        body: JSON.stringify({
          name: whitelistForm.name || selectedEscort?.name || '陪诊员',
          escortId: whitelistForm.escortId,
          accessCode: whitelistForm.accessCode,
          note: whitelistForm.note || undefined,
        }),
      })
      setWhitelistForm({ name: '', escortId: '', accessCode: '', note: '' })
      await loadData()
      setMessage('已更新陪诊员个人口令')
    } catch (error) {
      handleRequestError(error, '口令更新失败')
    }
  }

  const resetEscortForm = () => {
    setEscortForm(emptyEscortForm)
    setEditingEscortId(null)
  }

  const editEscort = (escort: Escort) => {
    setEditingEscortId(escort.id)
    setEscortForm({
      name: escort.name,
      phone: escort.phone,
      familiarHospitals: escort.familiarHospitals.join('\n'),
      status: escort.status,
    })
    setActiveView('escorts')
  }

  const saveEscort = async () => {
    const familiarHospitals = parseEscortHospitals(escortForm.familiarHospitals)
    if (!escortForm.name.trim() || !escortForm.phone.trim() || familiarHospitals.length === 0) {
      setMessage('请填写陪诊员姓名、手机号和熟悉医院')
      return
    }

    try {
      const payload = {
        name: escortForm.name.trim(),
        phone: escortForm.phone.trim(),
        familiarHospitals,
        status: escortForm.status,
      }
      if (editingEscortId) {
        await requestJson<Escort>(`/api/admin/escorts/${editingEscortId}`, {
          session,
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setMessage('已更新陪诊员资料')
      } else {
        await requestJson<Escort>('/api/admin/escorts', {
          session,
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setMessage('已新增陪诊员')
      }
      resetEscortForm()
      await loadData()
    } catch (error) {
      handleRequestError(error, editingEscortId ? '更新陪诊员失败' : '新增陪诊员失败')
    }
  }

  const toggleEscortStatus = async (escort: Escort) => {
    const nextStatus: Escort['status'] = escort.status === 'off' ? 'available' : 'off'
    try {
      await requestJson<Escort>(`/api/admin/escorts/${escort.id}/status`, {
        session,
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      })
      await loadData()
      setMessage(nextStatus === 'off' ? '已停用陪诊员' : '已启用陪诊员')
    } catch (error) {
      handleRequestError(error, '陪诊员状态更新失败')
    }
  }

  const toggleAccessCodeItem = async (item: EscortWhitelistItem) => {
    try {
      await requestJson<EscortWhitelistItem>(`/api/admin/escort-access-codes/${item.id}/status`, {
        session,
        method: 'POST',
        body: JSON.stringify({
          status: item.status === 'active' ? 'disabled' : 'active',
        }),
      })
      await loadData()
    } catch (error) {
      handleRequestError(error, '口令状态更新失败')
    }
  }

  const navItems: Array<{ key: AdminView; label: string; description: string; icon: typeof LayoutDashboard }> = [
    { key: 'dashboard', label: '今日工作台', description: `${workQueue.length} 个待办`, icon: LayoutDashboard },
    { key: 'orders', label: '订单中心', description: `${orders.length} 个订单`, icon: ClipboardList },
    { key: 'escorts', label: '陪诊员管理', description: `${escorts.length} 人`, icon: UsersRound },
    { key: 'logs', label: '通知与日志', description: `${notificationLogs.length} 条`, icon: BellRing },
    { key: 'settings', label: '系统状态', description: health?.persistence ?? '未连接', icon: Settings },
  ]

  const dashboardCards = [
    {
      label: '待电话确认',
      value: orders.filter((order) => order.status === 'pending_confirmation').length,
      hint: '客服先确认需求',
      filter: 'pending_confirmation' as OrderFilter,
    },
    {
      label: '待支付核验',
      value: waitingPaymentOrders.length,
      hint: '支付前不派单',
      filter: 'waiting_payment' as OrderFilter,
    },
    {
      label: '待派单',
      value: waitingAssignOrders.length,
      hint: '已支付可安排',
      filter: 'waiting_assign' as OrderFilter,
    },
    {
      label: '服务中',
      value: activeServiceOrders.length,
      hint: '关注进度同步',
      filter: 'active_service' as OrderFilter,
    },
    {
      label: '异常',
      value: riskOrders.filter((order) => order.status === 'exception_handling' || order.exceptions.some((item) => !item.handled)).length,
      hint: '优先处理',
      filter: 'risk' as OrderFilter,
    },
  ]

  const openOrderCenter = (order?: Order, status?: OrderFilter) => {
    if (order) setSelectedOrderId(order.id)
    if (status) setSelectedStatus(status)
    setActiveView('orders')
  }

  const orderDetailPanel = selectedOrder ? (
    <div className="panel detail-panel">
      <div className="panel-title-row">
        <h2>订单详情</h2>
        <span>{selectedOrder.orderNo}</span>
      </div>
      {selectedOrderStage && (
        <>
          <div className="decision-strip">
            <div className={`decision-card tone-${selectedOrderStage.tone}`}>
              <span>当前处理</span>
              <strong>{selectedOrderStage.label}</strong>
              <em>{selectedOrderStage.hint}</em>
            </div>
            <div className="decision-card">
              <span>支付状态</span>
              <strong>{paymentStatusText[selectedOrder.payment?.status ?? 'unpaid']}</strong>
              <em>{formatFen(selectedOrder.payment?.paidAmountFen ?? selectedOrder.payment?.amountFen)}</em>
            </div>
            <div className="decision-card">
              <span>陪诊员</span>
              <strong>{selectedOrder.escort?.name ?? '未派单'}</strong>
              <em>{selectedOrder.escort?.phone ?? '支付后安排'}</em>
            </div>
            <div className="decision-card">
              <span>服务进度</span>
              <strong>{getAdminProgressPercent(selectedOrder)}%</strong>
              <em>{getAdminCurrentProgressLabel(selectedOrder)}</em>
            </div>
          </div>
          <div className="quick-actions">
            <button onClick={() => void confirmOrder()} disabled={selectedOrder.status !== 'pending_confirmation'}>
              电话确认完成
            </button>
            <button className="secondary-action" onClick={() => void syncWechatPayment()} disabled={!selectedOrder.payment}>
              同步支付
            </button>
            <button className="secondary-action" onClick={() => void advanceProgress()} disabled={!canAdvanceProgress(selectedOrder)}>
              推进进度
            </button>
            {selectedOrder.status === 'exception_handling' && (
              <button className="secondary-action" onClick={() => void resolveException('resume')}>
                异常已处理
              </button>
            )}
          </div>
        </>
      )}
      <div className="detail-card order-summary-card">
        <div className="detail-card-head">
          <div>
            <span>预约医院</span>
            <strong>{selectedOrder.hospitalName}</strong>
          </div>
          <em>{statusText[selectedOrder.status]}</em>
        </div>
        <div className="detail-info-grid">
          <div className="detail-line">
            <MapPin size={18} />
            <span>{selectedOrder.departmentName || '科室待确认'}</span>
          </div>
          <div className="detail-line">
            <CalendarClock size={18} />
            <span>{selectedOrder.visitDate} {selectedOrder.visitTime}</span>
          </div>
          <div className="detail-line">
            <ClipboardList size={18} />
            <span>{serviceText[selectedOrder.servicePackage]} · ¥{selectedOrder.estimatedPrice}</span>
          </div>
          <div className="detail-line">
            <PhoneCall size={18} />
            <span>{selectedOrder.contactName} · {selectedOrder.contactPhone}</span>
          </div>
        </div>
        {selectedOrder.specialNotes && <p>{selectedOrder.specialNotes}</p>}
      </div>

      <form className="ops-editor" onSubmit={(event) => void saveOrderEdits(event)}>
        <div className="panel-title-row compact-title">
          <h3>运营编辑</h3>
          <span>电话确认后同步修正</span>
        </div>
        <div className="escort-form">
          <label>
            <span>医院</span>
            <input
              value={orderForm.hospitalName}
              onChange={(event) => setOrderForm((current) => ({ ...current, hospitalName: event.target.value }))}
            />
          </label>
          <label>
            <span>科室</span>
            <input
              value={orderForm.departmentName}
              onChange={(event) => setOrderForm((current) => ({ ...current, departmentName: event.target.value }))}
            />
          </label>
          <label>
            <span>日期</span>
            <input
              type="date"
              value={orderForm.visitDate}
              onChange={(event) => setOrderForm((current) => ({ ...current, visitDate: event.target.value }))}
            />
          </label>
          <label>
            <span>时间</span>
            <input
              type="time"
              value={orderForm.visitTime}
              onChange={(event) => setOrderForm((current) => ({ ...current, visitTime: event.target.value }))}
            />
          </label>
          <label>
            <span>套餐</span>
            <select
              value={orderForm.servicePackage}
              onChange={(event) => setOrderForm((current) => ({ ...current, servicePackage: event.target.value as ServicePackageKey }))}
            >
              <option value="single_task">单项代办/陪同</option>
              <option value="half_day">半日陪诊</option>
              <option value="full_day">全日陪诊</option>
            </select>
          </label>
          <label>
            <span>价格</span>
            <input
              inputMode="numeric"
              value={orderForm.estimatedPrice}
              onChange={(event) => setOrderForm((current) => ({ ...current, estimatedPrice: event.target.value }))}
            />
          </label>
          <label>
            <span>联系人</span>
            <input
              value={orderForm.contactName}
              onChange={(event) => setOrderForm((current) => ({ ...current, contactName: event.target.value }))}
            />
          </label>
          <label>
            <span>电话</span>
            <input
              value={orderForm.contactPhone}
              onChange={(event) => setOrderForm((current) => ({ ...current, contactPhone: event.target.value }))}
            />
          </label>
          <label className="full">
            <span>老人关系</span>
            <input
              value={orderForm.elderRelation}
              onChange={(event) => setOrderForm((current) => ({ ...current, elderRelation: event.target.value }))}
            />
          </label>
          <label className="full">
            <span>需求备注</span>
            <textarea
              value={orderForm.specialNotes}
              onChange={(event) => setOrderForm((current) => ({ ...current, specialNotes: event.target.value }))}
            />
          </label>
          <label className="full">
            <span>客服备注</span>
            <textarea
              value={orderForm.customerServiceNote}
              onChange={(event) => setOrderForm((current) => ({ ...current, customerServiceNote: event.target.value }))}
            />
          </label>
          <button className="escort-save-action" type="submit">
            保存订单信息
          </button>
        </div>
        <div className="cancel-strip">
          <input
            placeholder="取消原因"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            disabled={['completed', 'cancelled', 'unavailable'].includes(selectedOrder.status)}
          />
          <button
            className="danger-action"
            type="button"
            onClick={() => void cancelSelectedOrder()}
            disabled={['completed', 'cancelled', 'unavailable'].includes(selectedOrder.status)}
          >
            取消订单
          </button>
        </div>
      </form>

      <div className={selectedOrder.payment?.status === 'paid' ? 'payment-panel paid' : 'payment-panel'}>
        <div className="payment-heading">
          <CreditCard size={20} />
          <div>
            <span>微信支付核验</span>
            <strong>{paymentStatusText[selectedOrder.payment?.status ?? 'unpaid']}</strong>
          </div>
          <button
            className="secondary-action compact-action"
            onClick={() => void syncWechatPayment()}
            disabled={!selectedOrder.payment}
          >
            同步支付
          </button>
        </div>
        <div className="payment-facts">
          <div>
            <span>应付金额</span>
            <strong>{formatFen(selectedOrder.payment?.amountFen)}</strong>
          </div>
          <div>
            <span>实付金额</span>
            <strong>{formatFen(selectedOrder.payment?.paidAmountFen)}</strong>
          </div>
          <div>
            <span>商户单号</span>
            <strong>{selectedOrder.payment?.outTradeNo ?? '未生成'}</strong>
          </div>
          <div>
            <span>支付时间</span>
            <strong>{formatDateTime(selectedOrder.payment?.paidAt)}</strong>
          </div>
        </div>
        {selectedOrder.payment?.transactionId && (
          <p className="payment-trade-no">微信交易号：{selectedOrder.payment.transactionId}</p>
        )}
        <div className="refund-panel">
          <div className="refund-heading">
            <div>
              <span>退款售后</span>
              <strong>
                {selectedOrder.refund ? refundStatusText[selectedOrder.refund.status] : '未发起退款'}
              </strong>
            </div>
            <button
              className="secondary-action compact-action"
              onClick={() => void syncWechatRefund()}
              disabled={!selectedOrder.refund}
            >
              同步退款
            </button>
          </div>
          {selectedOrder.refund && (
            <div className="refund-facts">
              <span>退款金额</span>
              <strong>{formatFen(selectedOrder.refund.amountFen)}</strong>
              <span>退款单号</span>
              <strong>{selectedOrder.refund.outRefundNo}</strong>
              <span>到账时间</span>
              <strong>{formatDateTime(selectedOrder.refund.successTime)}</strong>
            </div>
          )}
          <div className="refund-form">
            <input
              placeholder="退款金额（元）"
              value={refundForm.amountYuan}
              onChange={(event) => setRefundForm((current) => ({ ...current, amountYuan: event.target.value }))}
              disabled={selectedOrder.payment?.status !== 'paid' || selectedOrder.refund?.status === 'success'}
            />
            <input
              placeholder="退款原因"
              value={refundForm.reason}
              onChange={(event) => setRefundForm((current) => ({ ...current, reason: event.target.value }))}
              disabled={selectedOrder.payment?.status !== 'paid' || selectedOrder.refund?.status === 'success'}
            />
            <button
              className="danger-action"
              onClick={() => void requestWechatRefund()}
              disabled={
                selectedOrder.payment?.status !== 'paid' ||
                selectedOrder.refund?.status === 'success' ||
                selectedOrder.refund?.status === 'processing'
              }
            >
              发起退款
            </button>
          </div>
        </div>
      </div>

      <div className="next-action-box">
        <span>下一步建议</span>
        <strong>{getAdminNextAction(selectedOrder)}</strong>
        <div className="progress-meter">
          <i style={{ width: `${getAdminProgressPercent(selectedOrder)}%` }} />
        </div>
      </div>

      <div className="checklist">
        <h3>电话确认清单</h3>
        {['医院和科室是否准确', '老人行动情况和是否需要轮椅', '费用边界已说明', '医疗费用由家属支付'].map((item) => (
          <label key={item}>
            <input type="checkbox" defaultChecked={selectedOrder.status !== 'pending_confirmation'} />
            <span>{item}</span>
          </label>
        ))}
      </div>

      {selectedOrder.exceptions.length > 0 && (
        <div className="exception-box">
          <h3>异常记录</h3>
          {selectedOrder.exceptions.map((item) => (
            <div className="exception-item" key={item.id}>
              <strong>{item.exceptionType}</strong>
              <span>{item.description}</span>
              <em>{item.handled ? '已处理' : '待处理'}</em>
            </div>
          ))}
        </div>
      )}

      {!['cancelled', 'unavailable'].includes(selectedOrder.status) && (
        <div className="summary-editor">
          <div className="panel-title-row compact-title">
            <h3>服务总结</h3>
            <span>{selectedOrder.serviceSummary ? '可复核修改' : '完成服务后填写'}</span>
          </div>
          <div className="summary-form-grid">
            <label>
              <span>实际服务分钟</span>
              <input
                inputMode="numeric"
                value={serviceSummaryForm.actualDurationMinutes}
                onChange={(event) => setServiceSummaryForm((current) => ({ ...current, actualDurationMinutes: event.target.value }))}
              />
            </label>
            <label>
              <span>加时分钟</span>
              <input
                inputMode="numeric"
                value={serviceSummaryForm.overtimeMinutes}
                onChange={(event) => setServiceSummaryForm((current) => ({ ...current, overtimeMinutes: event.target.value }))}
              />
            </label>
            <label className="full">
              <span>就诊结果</span>
              <textarea
                placeholder="例如：已完成复诊、缴费和取药，医生建议两周后复查。"
                value={serviceSummaryForm.visitResult}
                onChange={(event) => setServiceSummaryForm((current) => ({ ...current, visitResult: event.target.value }))}
              />
            </label>
            <label className="full">
              <span>后续建议</span>
              <textarea
                placeholder="例如：按医嘱服药，检查报告出来后联系医生复诊。"
                value={serviceSummaryForm.followUpAdvice}
                onChange={(event) => setServiceSummaryForm((current) => ({ ...current, followUpAdvice: event.target.value }))}
              />
            </label>
            <label className="full">
              <span>运营备注</span>
              <textarea
                placeholder="内部记录：是否已同步家属、是否有售后事项。"
                value={serviceSummaryForm.operatorNote}
                onChange={(event) => setServiceSummaryForm((current) => ({ ...current, operatorNote: event.target.value }))}
              />
            </label>
            <button
              className="primary-action summary-save-action"
              onClick={() => void saveServiceSummary()}
              disabled={!selectedOrder.assignedEscortId && selectedOrder.status !== 'completed'}
            >
              保存总结并完成订单
            </button>
          </div>
        </div>
      )}

      {selectedOrder.serviceSummary && (
        <div className="summary-box">
          <h3>家属端展示内容</h3>
          <div className="summary-grid">
            <span>实际服务</span>
            <strong>{selectedOrder.serviceSummary.actualDurationMinutes} 分钟</strong>
            <span>加时</span>
            <strong>{selectedOrder.serviceSummary.overtimeMinutes} 分钟</strong>
          </div>
          <p>{selectedOrder.serviceSummary.visitResult}</p>
          <p>{selectedOrder.serviceSummary.followUpAdvice}</p>
          <em>{selectedOrder.serviceSummary.operatorNote}</em>
        </div>
      )}

      {selectedOrder.status === 'exception_handling' && (
        <div className="actions exception-actions">
          <button onClick={() => void resolveException('resume')}>
            恢复陪诊
          </button>
          <button className="danger-action" onClick={() => void resolveException('cancel')}>
            取消订单
          </button>
        </div>
      )}
    </div>
  ) : null

  const assignmentPanel = selectedOrder ? (
    <div className="panel side-panel">
      <div className="panel-title-row">
        <h2>派单</h2>
        <span>{selectedOrder.escort?.name ?? '未派单'}</span>
      </div>
      <div className="escort-list">
        {escorts.map((escort) => (
          <button className="escort-row" key={escort.id} onClick={() => void assignOrder(escort)} disabled={escort.status !== 'available' || !canAssign(selectedOrder)}>
            <div>
              <strong>{escort.name}</strong>
              <span>{escort.familiarHospitals.join(' / ')}</span>
            </div>
            <em className={escort.status === 'available' ? 'free' : 'busy'}>{escortStatusText[escort.status]}</em>
          </button>
        ))}
      </div>
      {selectedOrder.payment?.status !== 'paid' && (
        <p className="payment-warning">订单未支付，暂不建议派单。请家属完成支付后再安排陪诊员。</p>
      )}

      <div className="progress-box">
        <h3>服务进度</h3>
        {progressSteps.map((step) => (
          <div className="progress-row" key={step.key}>
            <CheckCircle2 className={selectedOrder.progress.some((item) => item.stepKey === step.key) ? 'done' : ''} size={18} />
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  ) : null

  const dashboardView = (
    <>
      <section className="hero-workbench">
        <div>
          <span>兰州自营陪诊 · 今日运营</span>
          <h2>先处理会阻塞服务的订单</h2>
          <p>电话确认、支付核验、派单和异常处理集中在一个待办队列里。</p>
        </div>
        <button className="primary-action" onClick={() => openOrderCenter(undefined, 'pending_confirmation')}>
          进入订单中心
          <ChevronRight size={18} />
        </button>
      </section>

      <section className="metrics dashboard-metrics">
        {dashboardCards.map((item) => (
          <button
            className="metric-card"
            key={item.label}
            onClick={() => openOrderCenter(undefined, item.filter)}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.hint}</em>
          </button>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="panel work-queue-panel">
          <div className="panel-title-row">
            <h2>待办队列</h2>
            <span>{workQueue.length} 项</span>
          </div>
          <div className="work-queue">
            {workQueue.slice(0, 8).map((order) => {
              const stage = getAdminWorkStage(order)
              return (
                <button className="work-item" key={order.id} onClick={() => openOrderCenter(order, order.status)}>
                  <em className={`stage-pill tone-${stage.tone}`}>{stage.label}</em>
                  <div>
                    <strong>{order.hospitalName}</strong>
                    <span>{order.contactName} · {order.visitDate} {order.visitTime}</span>
                    <small>{getAdminNextAction(order)}</small>
                  </div>
                  <ChevronRight size={18} />
                </button>
              )
            })}
            {!workQueue.length && <p className="empty-text">当前没有需要马上处理的订单。</p>}
          </div>
        </div>

        <div className="panel service-board">
          <div className="panel-title-row">
            <h2>服务进度</h2>
            <span>{activeServiceOrders.length} 单进行中</span>
          </div>
          <div className="ops-list">
            {activeServiceOrders.slice(0, 5).map((order) => (
              <button className="ops-row" key={order.id} onClick={() => openOrderCenter(order, order.status)}>
                <div>
                  <strong>{order.hospitalName}</strong>
                  <span>{order.escort?.name ?? '未派单'} · {getAdminCurrentProgressLabel(order)}</span>
                </div>
                <em>{getAdminProgressPercent(order)}%</em>
              </button>
            ))}
            {!activeServiceOrders.length && <p className="empty-text">暂无进行中的陪诊任务。</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title-row">
            <h2>陪诊员负载</h2>
            <span>{escorts.length} 人</span>
          </div>
          <div className="load-list">
            {escortLoads.map(({ escort, activeOrders }) => (
              <div className="load-row" key={escort.id}>
                <div>
                  <strong>{escort.name}</strong>
                  <span>{escortStatusText[escort.status]} · {activeOrders.length} 单</span>
                </div>
                <em className={activeOrders.length >= 2 ? 'busy' : 'free'}>
                  {activeOrders.length >= 2 ? '满载' : '可接'}
                </em>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )

  const ordersView = (
    <>
      <section className="metrics compact-metrics">
        {counts.map((item) => (
          <button
            className={selectedStatus === item.status ? 'metric-card selected' : 'metric-card'}
            key={item.status}
            onClick={() => setSelectedStatus(item.status)}
          >
            <span>{statusText[item.status]}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
        <button className={selectedStatus === 'all' ? 'metric-card selected' : 'metric-card'} onClick={() => setSelectedStatus('all')}>
          <span>全部</span>
          <strong>{orders.length}</strong>
        </button>
      </section>

      <section className="filter-strip">
        {[
          { key: 'risk' as OrderFilter, label: '异常优先', count: riskOrders.length },
          { key: 'waiting_payment' as OrderFilter, label: '待支付核验', count: waitingPaymentOrders.length },
          { key: 'waiting_assign' as OrderFilter, label: '待派单', count: waitingAssignOrders.length },
          { key: 'active_service' as OrderFilter, label: '服务中', count: activeServiceOrders.length },
        ].map((item) => (
          <button
            className={selectedStatus === item.key ? 'active' : ''}
            key={item.key}
            onClick={() => setSelectedStatus(item.key)}
          >
            <span>{item.label}</span>
            <em>{item.count}</em>
          </button>
        ))}
      </section>

      <section className="content-grid">
        <div className="panel order-list">
          <div className="panel-title-row">
            <h2>订单池</h2>
            <span>{visibleOrders.length} / {filteredOrders.length} 单</span>
          </div>
          <label className="order-search">
            <span>搜索订单</span>
            <input
              placeholder="订单号、医院、联系人、陪诊员"
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
            />
          </label>
          {visibleOrders.map((order) => {
            const stage = getAdminWorkStage(order)
            return (
              <button
                className={selectedOrder?.id === order.id ? 'order-row active' : 'order-row'}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <div className="order-row-copy">
                  <strong>{order.hospitalName}</strong>
                  <span>{order.contactName} · {order.elderRelation} · {order.visitDate} {order.visitTime}</span>
                  <small>{getAdminNextAction(order)}</small>
                </div>
                <div className="order-row-tags">
                  <em className={`stage-pill tone-${stage.tone}`}>{stage.label}</em>
                  <em className={order.payment?.status === 'paid' ? 'paid' : 'unpaid'}>
                    {paymentStatusText[order.payment?.status ?? 'unpaid']}
                  </em>
                </div>
              </button>
            )
          })}
          {!visibleOrders.length && <p className="empty-text">当前筛选下没有订单。</p>}
        </div>
        {orderDetailPanel}
        {assignmentPanel}
      </section>
    </>
  )

  const escortsView = (
    <section className="management-grid">
      <div className="panel roster-panel">
        <div className="panel-title-row">
          <h2>陪诊员状态</h2>
          <span>{escorts.length} 人自营团队</span>
        </div>
        <div className="escort-roster">
          {escortLoads.map(({ escort, activeOrders }) => (
            <div className="roster-card" key={escort.id}>
              <div className="roster-card-head">
                <div>
                  <strong>{escort.name}</strong>
                  <span>{escort.phone}</span>
                </div>
                <em className={escort.status === 'available' ? 'free' : 'busy'}>{escortStatusText[escort.status]}</em>
              </div>
              <p>{escort.familiarHospitals.join(' / ')}</p>
              <small>当前 {activeOrders.length} 单进行中</small>
              <div className="roster-actions">
                <button className="secondary-action compact-action" onClick={() => editEscort(escort)}>
                  编辑
                </button>
                <button
                  className="secondary-action compact-action"
                  onClick={() => void toggleEscortStatus(escort)}
                  disabled={escort.status === 'busy'}
                >
                  {escort.status === 'off' ? '启用' : '停用'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="management-side">
        <div className="panel escort-form-panel">
          <div className="panel-title-row">
            <h2>{editingEscortId ? '编辑陪诊员' : '新增陪诊员'}</h2>
            {editingEscortId && (
              <button className="secondary-action compact-action" onClick={resetEscortForm}>
                取消编辑
              </button>
            )}
          </div>
          <div className="escort-form">
            <label>
              <span>姓名</span>
              <input
                placeholder="例如：王芳"
                value={escortForm.name}
                onChange={(event) => setEscortForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>手机号</span>
              <input
                placeholder="用于运营联系"
                value={escortForm.phone}
                onChange={(event) => setEscortForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label>
              <span>服务状态</span>
              <select
                value={escortForm.status}
                onChange={(event) => setEscortForm((current) => ({ ...current, status: event.target.value as Escort['status'] }))}
              >
                <option value="available">空闲</option>
                <option value="busy">服务中</option>
                <option value="off">休息/停用</option>
              </select>
            </label>
            <label className="full">
              <span>熟悉医院</span>
              <textarea
                placeholder={'一行一个，或用顿号/逗号分隔\n例如：兰州大学第一医院、甘肃省人民医院'}
                value={escortForm.familiarHospitals}
                onChange={(event) => setEscortForm((current) => ({ ...current, familiarHospitals: event.target.value }))}
              />
            </label>
            <button className="primary-action escort-save-action" onClick={() => void saveEscort()}>
              {editingEscortId ? '保存修改' : '新增陪诊员'}
            </button>
          </div>
        </div>

        <div className="panel whitelist-box standalone">
          <div className="panel-title-row compact">
            <h2>个人口令管理</h2>
            <span>{escortWhitelist.filter((item) => item.status === 'active').length} 个可用口令</span>
          </div>
          <p className="whitelist-hint">给每位自营陪诊员发一个个人口令。陪诊员在小程序输入口令即可进入任务页，无需再验证手机号。</p>
          <div className="whitelist-form two-column">
            <select
              value={whitelistForm.escortId}
              onChange={(event) => {
                const escort = escorts.find((item) => item.id === event.target.value)
                setWhitelistForm((current) => ({
                  ...current,
                  escortId: event.target.value,
                  name: escort?.name ?? current.name,
                }))
              }}
            >
              <option value="">选择陪诊员</option>
              {escorts.map((escort) => (
                <option key={escort.id} value={escort.id}>{escort.name}</option>
              ))}
            </select>
            <input
              placeholder="个人口令，如 lixia2026"
              value={whitelistForm.accessCode}
              onChange={(event) => setWhitelistForm((current) => ({ ...current, accessCode: event.target.value }))}
            />
            <input
              placeholder="备注，可选"
              value={whitelistForm.note}
              onChange={(event) => setWhitelistForm((current) => ({ ...current, note: event.target.value }))}
            />
            <button onClick={() => void addAccessCodeItem()}>保存口令</button>
          </div>
          <div className="whitelist-list">
            {escortWhitelist.map((item) => (
              <div className="whitelist-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>口令：{item.accessCode ?? '未设置'} · {item.note ?? '无备注'}</span>
                </div>
                <button
                  className={item.status === 'active' ? 'status-active' : 'status-disabled'}
                  onClick={() => void toggleAccessCodeItem(item)}
                >
                  {item.status === 'active' ? '启用中' : '已停用'}
                </button>
              </div>
            ))}
            {!escortWhitelist.length && <p className="empty-text">还没有配置陪诊员口令。</p>}
          </div>
        </div>
      </div>
    </section>
  )

  const logsView = (
    <section className="logs-grid">
      <div className="panel">
        <div className="panel-title-row">
          <h2>订阅消息记录</h2>
          <span>{notificationLogs.length} 条</span>
        </div>
        <div className="timeline-list">
          {notificationLogs.map((item) => (
            <div className="timeline-row" key={item.id}>
              <BellRing size={18} />
              <div>
                <strong>{item.event}</strong>
                <span>{item.channel} · {item.recipientType} · {formatDateTime(item.createdAt)}</span>
                {item.errorMessage && <p>{item.errorMessage}</p>}
              </div>
              <em className={item.status === 'failed' ? 'failed' : ''}>{notificationStatusText(item.status)}</em>
            </div>
          ))}
          {!notificationLogs.length && <p className="empty-text">暂无通知发送记录。</p>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title-row">
          <h2>近期进度记录</h2>
          <span>{recentProgress.length} 条</span>
        </div>
        <div className="timeline-list">
          {recentProgress.map((item) => (
            <button className="timeline-row clickable" key={item.id} onClick={() => openOrderCenter(item.order, item.order.status)}>
              <History size={18} />
              <div>
                <strong>{item.stepLabel}</strong>
                <span>{item.order.orderNo} · {item.order.hospitalName} · {formatDateTime(item.createdAt)}</span>
                {item.note && <p>{item.note}</p>}
              </div>
              <ChevronRight size={18} />
            </button>
          ))}
          {!recentProgress.length && <p className="empty-text">暂无服务进度记录。</p>}
        </div>
      </div>
    </section>
  )

  const settingsView = (
    <section className="settings-grid">
      <div className="panel">
        <div className="panel-title-row">
          <h2>线上健康状态</h2>
          <span>{health?.ok ? '正常' : '待检查'}</span>
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <Activity size={18} />
            <div>
              <strong>API 服务</strong>
              <span>{health?.service ?? '未连接'}</span>
            </div>
          </div>
          <div className="settings-row">
            <Hospital size={18} />
            <div>
              <strong>城市范围</strong>
              <span>兰州市 · 自营陪诊团队</span>
            </div>
          </div>
          <div className="settings-row">
            <WalletCards size={18} />
            <div>
              <strong>持久化</strong>
              <span>{health?.persistence ?? '未读取'}</span>
            </div>
          </div>
          <div className="settings-row">
            <KeyRound size={18} />
            <div>
              <strong>管理员</strong>
              <span>{session?.admin.displayName ?? '未登录'} · Token 登录</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel settings-note">
        <h2>配置边界</h2>
        <p>支付密钥、AppSecret、MySQL 密码继续放在微信云托管环境变量里。后台只显示健康状态，不直接编辑敏感配置。</p>
        <p>后续如果需要多人协作，再增加管理员账号、操作审计和权限分级。</p>
      </div>
    </section>
  )

  const activeViewTitle: Record<AdminView, string> = {
    dashboard: '今日工作台',
    orders: '订单中心',
    escorts: '陪诊员管理',
    logs: '通知与日志',
    settings: '系统状态',
  }

  const activeViewDescription: Record<AdminView, string> = {
    dashboard: '优先处理会阻塞履约的订单，适合每天打开后台后的第一屏。',
    orders: '电话确认、支付同步、派单、进度和异常处理都在这里完成。',
    escorts: '维护 4 人自营陪诊团队状态和小程序入口口令。',
    logs: '查看订阅消息、进度更新和服务链路是否正常。',
    settings: '只读查看线上健康、持久化和基础运行状态。',
  }

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-brand">
            <div className="brand-mark">陪</div>
            <div>
              <strong>颐年智陪</strong>
              <span>运营后台</span>
            </div>
          </div>
          <div className="login-copy">
            <ShieldCheck size={34} />
            <h1>登录运营工作台</h1>
            <p>用于订单确认、支付同步、派单和陪诊员口令管理。</p>
          </div>
          <form className="login-form" onSubmit={(event) => void loginAdmin(event)}>
            <label>
              <span>账号</span>
              <input
                autoComplete="username"
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
              />
            </label>
            <label>
              <span>密码</span>
              <input
                autoComplete="current-password"
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <button className="primary-action" type="submit" disabled={loginLoading}>
              {loginLoading ? '登录中' : '进入后台'}
            </button>
          </form>
          <p className="login-message">{message}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">陪</div>
          <div>
            <strong>颐年智陪</strong>
            <span>运营工作台</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={activeView === item.key ? 'nav-item active' : 'nav-item'}
                key={item.key}
                onClick={() => setActiveView(item.key)}
              >
                <Icon size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.description}</em>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{activeViewTitle[activeView]}</h1>
            <p>{activeViewDescription[activeView]} 当前状态：{message}</p>
          </div>
          <div className="topbar-actions">
            <span className="admin-session">{session.admin.displayName}</span>
            {showDevTools && (
              <button className="secondary-action" onClick={() => void resetDemoData()}>
                重置演示数据
              </button>
            )}
            <button className="primary-action" onClick={() => void loadData()}>
              <RefreshCw size={18} />
              {loading ? '同步中' : '刷新数据'}
            </button>
            <button className="icon-action" onClick={logoutAdmin} aria-label="退出登录">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {activeView === 'dashboard' && dashboardView}
        {activeView === 'orders' && ordersView}
        {activeView === 'escorts' && escortsView}
        {activeView === 'logs' && logsView}
        {activeView === 'settings' && settingsView}
      </section>
    </main>
  )
}

export default App
