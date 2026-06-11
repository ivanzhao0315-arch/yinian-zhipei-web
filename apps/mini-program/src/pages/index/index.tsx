import { Button, Image, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import './index.scss'

const homeDesignImage = '/assets/home-design-no-phone@2x.jpg'

export default function Index () {
  useLoad(() => {
    console.log('Home loaded.')
  })

  const goAppointment = (target: 'self' | 'family') => {
    Taro.setStorageSync('appointmentTarget', target)
    Taro.switchTab({ url: '/pages/appointment/index' })
  }

  return (
    <View className='home-page'>
      <View className='home-design-frame'>
        <Image className='home-design-image' mode='widthFix' src={homeDesignImage} />
        <Button
          aria-label='我自己需要陪诊'
          className='hotspot self-hotspot'
          onClick={() => goAppointment('self')}
        />
        <Button
          aria-label='帮家人预约'
          className='hotspot family-hotspot'
          onClick={() => goAppointment('family')}
        />
        <Button
          aria-label='查看订单进度'
          className='hotspot orders-hotspot'
          onClick={() => Taro.switchTab({ url: '/pages/orders/index' })}
        />
      </View>
    </View>
  )
}
