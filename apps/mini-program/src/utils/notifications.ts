import Taro from '@tarojs/taro'
import { apiRequest } from './request'

type TemplateScope = 'family' | 'familyOrder' | 'familyService' | 'escort'

const templateCache: Partial<Record<TemplateScope, string[]>> = {}

const loadTemplateIds = async (scope: TemplateScope) => {
  if (templateCache[scope]) {
    return templateCache[scope] || []
  }

  const response = await apiRequest<{
    family: string[]
    familyOrder: string[]
    familyService: string[]
    escort: string[]
  }>({
    path: '/api/notifications/templates',
    method: 'GET'
  })

  templateCache.family = response.data.family || []
  templateCache.familyOrder = response.data.familyOrder || []
  templateCache.familyService = response.data.familyService || []
  templateCache.escort = response.data.escort || []

  return templateCache[scope] || []
}

export const preloadNotificationTemplates = async (scope: TemplateScope) => {
  try {
    await loadTemplateIds(scope)
  } catch (error) {
    console.warn('preload notification templates failed', error)
  }
}

export const requestNotificationSubscription = (scope: TemplateScope) => {
  const templateIds = templateCache[scope] || []
  if (!templateIds.length) {
    return
  }

  return Taro.requestSubscribeMessage({
    tmplIds: templateIds.slice(0, 3),
  }).catch((error) => {
    console.warn('requestSubscribeMessage failed', error)
  })
}

export const requestFamilyNotificationSubscription = () =>
  requestNotificationSubscription('familyOrder')

export const requestFamilyServiceNotificationSubscription = () =>
  requestNotificationSubscription('familyService')

export const requestEscortNotificationSubscription = () =>
  requestNotificationSubscription('escort')
