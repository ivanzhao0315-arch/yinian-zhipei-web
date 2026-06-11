import Taro from '@tarojs/taro'
import { APP_ID } from './config'
import {
  preloadNotificationTemplates,
  requestEscortNotificationSubscription,
} from './notifications'
import { apiRequest } from './request'

const ROLE_KEY = 'yinian_role'
const ESCORT_ID_KEY = 'yinian_escort_id'
const ESCORT_PHONE_KEY = 'yinian_escort_phone'
const ESCORT_NAME_KEY = 'yinian_escort_name'
const ESCORT_ACCESS_CODE_KEY = 'yinian_escort_access_code'

type EscortProfile = {
  id: string
  name: string
  phone: string
}

type EscortSession = {
  escortId: string
  escortName: string
  escortPhone: string
  accessCode?: string
}

type VerifyEscortResponse = {
  accessCode?: string
  phone?: string
  escortId?: string
  name?: string
  escort?: EscortProfile
}

export const getStoredEscortSession = () => {
  const role = Taro.getStorageSync(ROLE_KEY)
  const escortId = Taro.getStorageSync(ESCORT_ID_KEY)
  if (role !== 'escort' || !escortId) {
    return undefined
  }

  return {
    escortId,
    escortPhone: Taro.getStorageSync(ESCORT_PHONE_KEY) || '',
    escortName: Taro.getStorageSync(ESCORT_NAME_KEY) || '',
    accessCode: Taro.getStorageSync(ESCORT_ACCESS_CODE_KEY) || undefined,
  } as EscortSession
}

export const storeEscortSession = (session: EscortSession) => {
  Taro.setStorageSync(ROLE_KEY, 'escort')
  Taro.setStorageSync(ESCORT_ID_KEY, session.escortId)
  Taro.setStorageSync(ESCORT_PHONE_KEY, session.escortPhone)
  Taro.setStorageSync(ESCORT_NAME_KEY, session.escortName)
  if (session.accessCode) {
    Taro.setStorageSync(ESCORT_ACCESS_CODE_KEY, session.accessCode)
  }
}

export const verifyEscortAccessCode = async (accessCodeInput: string) => {
  const accessCode = accessCodeInput.trim()
  if (!accessCode) {
    throw new Error('invalid_escort_access_code')
  }

  const response = await apiRequest<VerifyEscortResponse>({
    path: '/api/escort/auth/code-verify',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
    },
    data: {
      accessCode,
    },
  })

  if (response.statusCode >= 400) {
    throw new Error('escort_access_code_not_allowed')
  }

  const escortId = response.data.escort?.id ?? response.data.escortId
  if (!escortId) {
    throw new Error('escort_access_code_unbound')
  }

  return {
    escortId,
    escortName: response.data.escort?.name ?? response.data.name ?? '陪诊员',
    escortPhone: response.data.escort?.phone ?? response.data.phone ?? '',
    accessCode,
  } satisfies EscortSession
}

export const bindEscortWechat = async (session: EscortSession) => {
  if (!session.accessCode) {
    throw new Error('missing_escort_access_code')
  }

  await preloadNotificationTemplates('escort')
  await requestEscortNotificationSubscription()
  const loginResult = await Taro.login()
  const response = await apiRequest({
    path: '/api/escort/auth/wechat-bind',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
    },
    data: {
      appId: APP_ID,
      code: loginResult.code,
      escortId: session.escortId,
      accessCode: session.accessCode,
    },
  })

  if (response.statusCode >= 400) {
    throw new Error('escort_wechat_bind_failed')
  }

  storeEscortSession(session)
}

export const verifyAndBindEscort = async (accessCode: string) => {
  const session = await verifyEscortAccessCode(accessCode)
  await bindEscortWechat(session)
  return session
}

export type { EscortSession }
