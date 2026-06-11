import Taro from '@tarojs/taro'
import { API_BASE, APP_ID } from './config'
import { apiRequest } from './request'

const STORAGE_KEY = 'yinianAuth'

type AuthSession = {
  role: 'family'
  userId: string
  openId: string
  appId: string
  nickname?: string
  phone?: string
}

export const getStoredAuth = () => {
  const stored = Taro.getStorageSync(STORAGE_KEY) as AuthSession | ''
  return stored || undefined
}

export const ensureFamilyAuth = async () => {
  const stored = getStoredAuth()
  if (stored?.userId && stored.openId) {
    return stored
  }

  const appId = APP_ID

  const cloudHeaderResponse = await apiRequest<AuthSession>({
    path: '/api/auth/demo/wechat-login',
    method: 'POST',
    header: {
      'Content-Type': 'application/json'
    },
    data: {
      appId,
      nickname: '家属用户'
    }
  })

  let response = cloudHeaderResponse

  if (cloudHeaderResponse.statusCode >= 400 || !cloudHeaderResponse.data?.openId) {
    const loginResult = await Taro.login()
    response = await apiRequest<AuthSession>({
      path: '/api/auth/demo/wechat-login',
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        appId,
        code: loginResult.code,
        nickname: '家属用户'
      }
    })
  }

  if (response.statusCode >= 400 || !response.data?.userId || !response.data?.openId) {
    throw new Error('wechat_login_failed')
  }

  const auth = {
    ...response.data,
    appId,
  }

  Taro.setStorageSync(STORAGE_KEY, auth)
  return auth
}

export const familyAuthHeaders = (auth: AuthSession) => ({
  'x-demo-user-id': auth.userId
})

export { API_BASE }
export type { AuthSession }
