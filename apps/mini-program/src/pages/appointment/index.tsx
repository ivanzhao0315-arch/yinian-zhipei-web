import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'

const hospitals = ['兰州大学第一医院', '兰州大学第二医院', '甘肃省人民医院', '甘肃省中医院', '兰州市第一人民医院']
const services = ['单项代办/陪同 ¥158 起', '半日陪诊 ¥238 起', '全日陪诊 ¥458 起']
const relations = ['本人', '父亲', '母亲', '配偶', '爷爷/奶奶', '外公/外婆', '其他家人']

export default function Appointment () {
  const [hospitalIndex, setHospitalIndex] = useState(0)
  const [serviceIndex, setServiceIndex] = useState(1)
  const [relationIndex, setRelationIndex] = useState(1)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('08:30')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  useDidShow(() => {
    const target = Taro.getStorageSync<'self' | 'family'>('appointmentTarget')
    if (target === 'self') {
      setRelationIndex(0)
    }
    if (target === 'family') {
      setRelationIndex((current) => (current === 0 ? 1 : current))
    }
  })

  const goConfirm = () => {
    if (!contactName.trim()) {
      Taro.showToast({
        title: '请填写联系人姓名',
        icon: 'none'
      })
      return
    }
    if (contactPhone.length < 11) {
      Taro.showToast({
        title: '请填写手机号',
        icon: 'none'
      })
      return
    }

    Taro.setStorageSync('appointmentDraft', {
      hospital: hospitals[hospitalIndex],
      service: services[serviceIndex],
      relation: relations[relationIndex],
      date,
      time,
      contactName: contactName.trim(),
      contactPhone
    })
    Taro.navigateTo({ url: '/pages/confirm/index' })
  }

  return (
    <View className='page appointment-page'>
      <View className='form-head'>
        <Text className='form-title'>{relations[relationIndex] === '本人' ? '预约自己的陪诊' : '帮家人预约陪诊'}</Text>
        <Text className='form-copy'>提交后由客服电话确认，再根据医院和时间安排自营陪诊员。</Text>
      </View>

      <View className='form-card card'>
        <Text className='field-label'>服务对象</Text>
        <Picker mode='selector' range={relations} value={relationIndex} onChange={(event) => setRelationIndex(Number(event.detail.value))}>
          <View className='select-row'>
            <Text>{relations[relationIndex]}</Text>
            <Text className='select-arrow'>选择</Text>
          </View>
        </Picker>

        <Text className='field-label'>就诊医院</Text>
        <Picker mode='selector' range={hospitals} value={hospitalIndex} onChange={(event) => setHospitalIndex(Number(event.detail.value))}>
          <View className='select-row'>
            <Text>{hospitals[hospitalIndex]}</Text>
            <Text className='select-arrow'>选择</Text>
          </View>
        </Picker>

        <Text className='field-label'>服务类型</Text>
        <Picker mode='selector' range={services} value={serviceIndex} onChange={(event) => setServiceIndex(Number(event.detail.value))}>
          <View className='select-row'>
            <Text>{services[serviceIndex]}</Text>
            <Text className='select-arrow'>选择</Text>
          </View>
        </Picker>

        <Text className='field-label'>就诊时间</Text>
        <View className='date-grid'>
          <Picker mode='date' value={date} onChange={(event) => setDate(String(event.detail.value))}>
            <View className='select-row compact'>
              <Text>{date}</Text>
            </View>
          </Picker>
          <Picker mode='time' value={time} onChange={(event) => setTime(String(event.detail.value))}>
            <View className='select-row compact'>
              <Text>{time}</Text>
            </View>
          </Picker>
        </View>

        <Text className='field-label'>联系人姓名</Text>
        <Input
          className='text-input'
          placeholder='请输入联系人姓名'
          maxlength={20}
          value={contactName}
          onInput={(event) => setContactName(String(event.detail.value))}
        />

        <Text className='field-label'>联系人手机</Text>
        <Input
          className='text-input'
          type='number'
          placeholder={relations[relationIndex] === '本人' ? '请输入本人手机号' : '请输入家属手机号'}
          maxlength={11}
          value={contactPhone}
          onInput={(event) => setContactPhone(String(event.detail.value))}
        />

      </View>

      <View className='result-card card'>
        <Text className='result-title'>提交前会进入确认页</Text>
        <Text className='result-copy'>请核对医院、时间、费用说明和“不垫付医疗费用”规则后再确认预约。</Text>
      </View>

      <Button className='primary-button submit-button' onClick={goConfirm}>下一步，确认预约</Button>
    </View>
  )
}
