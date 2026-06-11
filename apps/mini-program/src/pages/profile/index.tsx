import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import { verifyAndBindEscort } from '../../utils/escort-auth'
import {
  CUSTOMER_SERVICE_HOURS,
  CUSTOMER_SERVICE_PHONE,
  CUSTOMER_SERVICE_PHONE_DISPLAY,
} from '../../utils/support'

export default function Profile () {
  const callSupport = () => Taro.makePhoneCall({ phoneNumber: CUSTOMER_SERVICE_PHONE })
  const openAgreement = () => Taro.navigateTo({ url: '/pages/agreement/index' })
  const openPrivacy = () => Taro.navigateTo({ url: '/pages/privacy/index' })

  const openEscortEntry = async () => {
    const result = await Taro.showModal({
      title: '内部陪诊员入口',
      content: '该入口仅供自营陪诊员使用。确认后请输入个人口令。',
      confirmText: '进入'
    })

    if (!result.confirm) return

    const input = await Taro.showModal({
      title: '输入个人口令',
      editable: true,
      placeholderText: '请输入陪诊员口令',
      confirmText: '验证'
    })

    if (!input.confirm) return

    try {
      await verifyAndBindEscort(input.content || '')
    } catch (error) {
      console.error(error)
      const title = error instanceof Error && error.message === 'escort_wechat_bind_failed'
        ? '微信绑定失败，请稍后重试'
        : '口令不正确'
      Taro.showToast({
        title,
        icon: 'none'
      })
      return
    }
    await Taro.navigateTo({ url: '/pages/escort/index' })
  }

  return (
    <View className='page profile-page'>
      <View className='support-card card' onClick={callSupport}>
        <View className='support-icon'>电</View>
        <View className='support-copy'>
          <Text className='support-title'>联系客服</Text>
          <Text className='support-meta'>{CUSTOMER_SERVICE_PHONE_DISPLAY} · 人工服务 {CUSTOMER_SERVICE_HOURS}</Text>
        </View>
        <Text className='support-action'>拨打</Text>
      </View>

      <View className='policy-card card'>
        <View className='policy-row' onClick={openAgreement}>
          <Text className='policy-title'>用户协议</Text>
          <Text className='policy-action'>查看</Text>
        </View>
        <View className='policy-row' onClick={openPrivacy}>
          <Text className='policy-title'>隐私政策</Text>
          <Text className='policy-action'>查看</Text>
        </View>
      </View>

      <View className='service-card card'>
        <Text className='section-title'>服务说明</Text>
        <View className='service-row'>
          <Text className='service-dot'>1</Text>
          <View>
            <Text className='service-title'>服务前电话确认</Text>
            <Text className='service-copy'>客服先核对医院、时间和陪诊需求。</Text>
          </View>
        </View>
        <View className='service-row'>
          <Text className='service-dot'>2</Text>
          <View>
            <Text className='service-title'>就诊进度微信同步</Text>
            <Text className='service-copy'>陪诊员会在关键节点更新订单进度。</Text>
          </View>
        </View>
        <View className='service-row'>
          <Text className='service-dot'>3</Text>
          <View>
            <Text className='service-title'>医疗费用由家属支付</Text>
            <Text className='service-copy'>挂号、检查、取药等费用不由陪诊员垫付。</Text>
          </View>
        </View>
      </View>

      <View className='internal-entry card' onClick={openEscortEntry}>
        <View>
          <Text className='internal-title'>工作人员入口</Text>
          <Text className='internal-copy'>自营陪诊员查看任务、同步服务进度。</Text>
        </View>
        <Text className='internal-note'>需口令</Text>
      </View>
    </View>
  )
}
