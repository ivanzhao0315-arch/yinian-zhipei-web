import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { initCloudRuntime } from './utils/request'

import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    initCloudRuntime()
    console.log('App launched.')
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
