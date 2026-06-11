import { Button, Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'
import { ensureFamilyAuth, familyAuthHeaders } from '../../utils/auth'
import { apiRequest } from '../../utils/request'
import {
  preloadNotificationTemplates,
  requestFamilyNotificationSubscription
} from '../../utils/notifications'

type AppointmentDraft = {
  hospital: string
  service: string
  relation: string
  date: string
  time: string
  contactPhone: string
  note?: string
}

const emptyDraft: AppointmentDraft = {
  hospital: '兰州大学第一医院',
  service: '半日陪诊 ¥238 起',
  relation: '父亲',
  date: '2026-06-04',
  time: '08:30',
  contactPhone: ''
}

const servicePackageMap: Record<string, 'single_task' | 'half_day' | 'full_day'> = {
  '单项代办/陪同 ¥158 起': 'single_task',
  '半日陪诊 ¥238 起': 'half_day',
  '全日陪诊 ¥458 起': 'full_day'
}

export default function Confirm () {
  const [draft, setDraft] = useState<AppointmentDraft>(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [agreementAccepted, setAgreementAccepted] = useState(false)

  useLoad(() => {
    void preloadNotificationTemplates('familyOrder')
    const stored = Taro.getStorageSync('appointmentDraft') as AppointmentDraft | ''
    if (stored) {
      setDraft(stored)
    }
  })

  const confirmOrder = async () => {
    if (submitting) return
    if (!agreementAccepted) {
      Taro.showToast({
        title: '请先同意用户协议和隐私政策',
        icon: 'none'
      })
      return
    }
    setSubmitting(true)
    try {
      void requestFamilyNotificationSubscription()
      const auth = await ensureFamilyAuth()
      const response = await apiRequest({
        path: '/api/orders',
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          ...familyAuthHeaders(auth)
        },
        data: {
          hospitalName: draft.hospital,
          visitDate: draft.date,
          visitTime: draft.time,
          servicePackage: servicePackageMap[draft.service] ?? 'half_day',
          contactName: '家属用户',
          contactPhone: draft.contactPhone,
          elderRelation: draft.relation
        }
      })

      if (response.statusCode >= 400) {
        throw new Error('create_order_failed')
      }

      Taro.removeStorageSync('appointmentDraft')
      Taro.showToast({
        title: '预约已提交',
        icon: 'success'
      })

      setTimeout(() => {
        Taro.switchTab({ url: '/pages/orders/index' })
      }, 600)
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '提交失败，请检查 API',
        icon: 'none'
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='page confirm-page'>
      <View className='confirm-head'>
        <Text className='confirm-title'>确认预约信息</Text>
        <Text className='confirm-copy'>确认后进入待电话确认，客服会先核对需求再派单。</Text>
      </View>

      <View className='summary-card card'>
        <View className='summary-row'>
          <Text className='summary-label'>医院</Text>
          <Text className='summary-value'>{draft.hospital}</Text>
        </View>
        <View className='summary-row'>
          <Text className='summary-label'>服务</Text>
          <Text className='summary-value'>{draft.service}</Text>
        </View>
        <View className='summary-row'>
          <Text className='summary-label'>就诊人</Text>
          <Text className='summary-value'>{draft.relation}</Text>
        </View>
        <View className='summary-row'>
          <Text className='summary-label'>时间</Text>
          <Text className='summary-value'>{draft.date} {draft.time}</Text>
        </View>
        <View className='summary-row'>
          <Text className='summary-label'>手机号</Text>
          <Text className='summary-value'>{draft.contactPhone || '未填写'}</Text>
        </View>
      </View>

      <View className='rules-card card'>
        <Text className='rules-title'>费用与服务规则</Text>
        <Text className='rule-item'>陪诊服务费按所选套餐起价计算，最终以客服确认为准。</Text>
        <Text className='rule-item'>挂号费、检查费、药费等医疗费用由家属自行支付。</Text>
        <Text className='rule-item'>陪诊员不垫付医疗费用，超时按 ¥60/小时补收。</Text>
      </View>

      <View className='agreement-card card'>
        <Text
          className={agreementAccepted ? 'agreement-check active' : 'agreement-check'}
          onClick={() => setAgreementAccepted((current) => !current)}
        >
          {agreementAccepted ? '✓' : ''}
        </Text>
        <View className='agreement-copy'>
          <Text className='agreement-text'>我已阅读并同意</Text>
          <Text className='agreement-link' onClick={() => Taro.navigateTo({ url: '/pages/agreement/index' })}>《用户协议》</Text>
          <Text className='agreement-text'>和</Text>
          <Text className='agreement-link' onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}>《隐私政策》</Text>
        </View>
      </View>

      <View className='confirm-actions'>
        <Button className='secondary-button' onClick={() => Taro.navigateBack()}>返回修改</Button>
        <Button className='primary-button' loading={submitting} onClick={confirmOrder}>
          {submitting ? '提交中' : '确认提交'}
        </Button>
      </View>
    </View>
  )
}
