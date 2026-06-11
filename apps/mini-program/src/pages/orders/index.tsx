import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'
import { ensureFamilyAuth, familyAuthHeaders } from '../../utils/auth'
import { apiRequest } from '../../utils/request'
import {
  preloadNotificationTemplates,
  requestFamilyServiceNotificationSubscription
} from '../../utils/notifications'
import { CUSTOMER_SERVICE_PHONE } from '../../utils/support'

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
}

type OrderException = {
  id: string
  description: string
  handled: boolean
}

type ServiceSummary = {
  id: string
  actualDurationMinutes: number
  visitResult: string
  followUpAdvice: string
  overtimeMinutes: number
  operatorNote: string
}

type PaymentStatus = 'pending' | 'paid' | 'closed' | 'refunded'

type PaymentInfo = {
  id: string
  outTradeNo: string
  amountFen: number
  status: PaymentStatus
  transactionId?: string
}

type PayParams = {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

type Escort = {
  id: string
  name: string
  phone: string
}

type OrderItem = {
  id: string
  orderNo: string
  hospitalName: string
  estimatedPrice: number
  visitDate: string
  visitTime: string
  servicePackage: ServicePackageKey
  status: OrderStatus
  escort?: Escort
  progress: OrderProgress[]
  exceptions: OrderException[]
  payment?: PaymentInfo
  serviceSummary?: ServiceSummary
}

const statusText: Record<OrderStatus, string> = {
  pending_confirmation: '待电话确认',
  confirmed: '已确认',
  assigned: '已派单',
  waiting_start: '等待服务开始',
  in_service: '陪诊中',
  completed: '已完成',
  cancelled: '已取消',
  unavailable: '暂无法服务',
  exception_handling: '异常处理中'
}

const serviceText: Record<ServicePackageKey, string> = {
  single_task: '单项代办/陪同',
  half_day: '半日陪诊',
  full_day: '全日陪诊'
}

const paymentText: Record<PaymentStatus | 'unpaid', string> = {
  unpaid: '待支付',
  pending: '待支付',
  paid: '已支付',
  closed: '已关闭',
  refunded: '已退款'
}

const steps = [
  { key: 'contacted_family', label: '已联系家属' },
  { key: 'arrived_hospital', label: '已到医院' },
  { key: 'seeing_doctor', label: '陪同就诊' },
  { key: 'service_finished', label: '服务结束' }
]

const nextText: Record<OrderStatus, string> = {
  pending_confirmation: '客服将在 30 分钟内电话确认',
  confirmed: '等待运营指派陪诊员',
  assigned: '陪诊员已派单，等待服务开始',
  waiting_start: '陪诊员将按约定时间到达',
  in_service: '陪诊员正在同步服务进度',
  completed: '服务已完成，可等待服务总结',
  cancelled: '订单已取消',
  unavailable: '客服将联系说明无法服务原因',
  exception_handling: '运营正在介入处理异常'
}

const statusTone: Record<OrderStatus, 'warm' | 'green' | 'blue' | 'gray' | 'danger'> = {
  pending_confirmation: 'warm',
  confirmed: 'blue',
  assigned: 'green',
  waiting_start: 'green',
  in_service: 'green',
  completed: 'gray',
  cancelled: 'gray',
  unavailable: 'danger',
  exception_handling: 'danger'
}

export default function Orders () {
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [payingOrderId, setPayingOrderId] = useState('')

  const loadOrders = async () => {
    setLoading(true)
    try {
      const auth = await ensureFamilyAuth()
      const response = await apiRequest<{ orders: OrderItem[] }>({
        path: '/api/my/orders',
        method: 'GET',
        header: familyAuthHeaders(auth)
      })

      if (response.statusCode >= 400) {
        throw new Error('load_orders_failed')
      }

      setOrders(response.data.orders.map((order) => ({
        ...order,
        progress: order.progress || [],
        exceptions: order.exceptions || []
      })))
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '订单同步失败',
        icon: 'none'
      })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    void preloadNotificationTemplates('familyService')
    void loadOrders()
  })

  const isPaid = (order: OrderItem) => order.payment?.status === 'paid'

  const canPay = (order: OrderItem) => (
    ['confirmed', 'assigned', 'waiting_start', 'in_service', 'completed'].includes(order.status) &&
    !isPaid(order)
  )

  const activeOrder = orders.find((order) => !['completed', 'cancelled', 'unavailable'].includes(order.status)) ?? orders[0]

  const latestProgress = (order: OrderItem) => order.progress[order.progress.length - 1]

  const progressIndex = (order: OrderItem) => {
    const completedKeys = order.progress.map((item) => item.stepKey)
    const latestIndex = steps.reduce((current, step, index) => (
      completedKeys.includes(step.key) ? index : current
    ), -1)
    if (order.status === 'completed') return steps.length - 1
    return latestIndex
  }

  const payOrder = async (order: OrderItem) => {
    if (payingOrderId) return

    setPayingOrderId(order.id)
    try {
      void requestFamilyServiceNotificationSubscription()
      const auth = await ensureFamilyAuth()
      const response = await apiRequest<{
        payment: PaymentInfo
        payParams: PayParams
        mode: 'mock' | 'live'
      }>({
        path: '/api/payments/wechat/prepay',
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          ...familyAuthHeaders(auth)
        },
        data: {
          orderId: order.id,
          appId: auth.appId,
          payerOpenId: auth.openId
        }
      })

      if (response.statusCode >= 400) {
        throw new Error('prepay_failed')
      }

      if (response.data.mode === 'mock' || response.data.payParams.paySign.startsWith('mock_')) {
        Taro.showToast({
          title: '已生成支付单',
          icon: 'success'
        })
      } else {
        await Taro.requestPayment(response.data.payParams)
        Taro.showToast({
          title: '支付完成',
          icon: 'success'
        })
      }

      await loadOrders()
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '支付发起失败',
        icon: 'none'
      })
    } finally {
      setPayingOrderId('')
    }
  }

  return (
    <View className='page orders-page'>
      <View className='orders-head'>
        <View>
          <Text className='orders-title'>我的订单</Text>
          <Text className='orders-copy'>
            {activeOrder ? `${activeOrder.hospitalName} · ${statusText[activeOrder.status]}` : '预约提交后，可在这里查看确认、支付、派单和陪诊进度。'}
          </Text>
        </View>
        <Button className='refresh-chip' loading={loading} onClick={loadOrders}>
          {loading ? '同步中' : '刷新'}
        </Button>
      </View>

      <View className='order-list'>
        {orders.map((order) => (
          <View className='order-card card' key={order.id}>
            <View className='order-top'>
              <View>
                <Text className='hospital'>{order.hospitalName}</Text>
                <Text className='order-meta'>{serviceText[order.servicePackage]} · {order.visitDate} {order.visitTime}</Text>
              </View>
              <Text className={`status ${statusTone[order.status]}`}>
                {statusText[order.status]}
              </Text>
            </View>

            <View className='next-box'>
              <Text className='next-label'>当前最重要的事</Text>
              <Text className='next-text'>{nextText[order.status]}</Text>
              {order.escort && (
                <View className='escort-card'>
                  <Text className='escort-label'>陪诊员</Text>
                  <Text className='escort-text'>{order.escort.name} · {order.escort.phone}</Text>
                </View>
              )}
              {order.exceptions.some((item) => !item.handled) && (
                <Text className='exception-text'>订单出现异常，运营正在介入处理。</Text>
              )}
            </View>

            <View className='payment-box'>
              <View>
                <Text className='payment-label'>服务费</Text>
                <Text className='payment-amount'>¥{order.estimatedPrice}</Text>
              </View>
              <View className='payment-side'>
                <Text className={isPaid(order) ? 'payment-status paid' : 'payment-status'}>
                  {paymentText[order.payment?.status ?? 'unpaid']}
                </Text>
                <Text className='order-id'>{order.orderNo}</Text>
              </View>
            </View>

            {canPay(order) && (
              <Button
                className='primary-button pay-button'
                loading={payingOrderId === order.id}
                onClick={() => payOrder(order)}
              >
                {payingOrderId === order.id ? '发起中' : '立即支付'}
              </Button>
            )}

            <View className='timeline-box'>
              <View className='section-head'>
                <Text className='section-title'>服务进度</Text>
                {latestProgress(order) && (
                  <Text className='section-note'>最新：{latestProgress(order)?.stepLabel}</Text>
                )}
              </View>
              <View className='step-row'>
                {steps.map((step, index) => {
                  const done = index <= progressIndex(order)
                  return (
                    <View className='step-item' key={step.key}>
                      <View className={done ? 'step-dot done' : 'step-dot'}>
                        <Text>{index + 1}</Text>
                      </View>
                      <Text className={done ? 'step-label done' : 'step-label'}>{step.label}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {order.serviceSummary && (
              <View className='summary-box'>
                <Text className='summary-title'>服务总结</Text>
                <Text className='summary-meta'>
                  实际服务 {order.serviceSummary.actualDurationMinutes} 分钟 · 加时 {order.serviceSummary.overtimeMinutes} 分钟
                </Text>
                <Text className='summary-copy'>{order.serviceSummary.visitResult}</Text>
                <Text className='summary-copy'>{order.serviceSummary.followUpAdvice}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {!orders.length && !loading && (
        <View className='empty-card card'>
          <Text className='empty-title'>暂无订单</Text>
          <Text className='empty-copy'>提交预约后，订单会出现在这里。你可以回到首页选择“自己需要陪诊”或“帮家人预约”。</Text>
          <Button className='primary-button empty-action' onClick={() => Taro.switchTab({ url: '/pages/appointment/index' })}>
            去预约陪诊
          </Button>
        </View>
      )}

      <Button className='secondary-button support-button' onClick={() => Taro.makePhoneCall({ phoneNumber: CUSTOMER_SERVICE_PHONE })}>
        联系客服
      </Button>
    </View>
  )
}
