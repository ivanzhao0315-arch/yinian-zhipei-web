import Taro from '@tarojs/taro'
import {
  API_BASE,
  CLOUDRUN_ENV,
  CLOUDRUN_SERVICE,
  USE_CLOUDRUN_CONTAINER,
} from './config'

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type ApiRequestOptions<TData = unknown> = {
  path: string
  method?: RequestMethod
  header?: Record<string, unknown>
  data?: TData
}

type ApiResponse<TResponse> = {
  data: TResponse
  statusCode: number
  header?: Record<string, unknown>
}

const canUseCloudContainer = () =>
  USE_CLOUDRUN_CONTAINER &&
  Taro.getEnv() === Taro.ENV_TYPE.WEAPP &&
  Boolean(Taro.cloud?.callContainer)

export const initCloudRuntime = () => {
  if (!USE_CLOUDRUN_CONTAINER || !Taro.cloud?.init) {
    return
  }

  Taro.cloud.init({
    env: CLOUDRUN_ENV,
  })
}

export const apiRequest = async <TResponse = unknown, TData = unknown>({
  path,
  method = 'GET',
  header = {},
  data,
}: ApiRequestOptions<TData>): Promise<ApiResponse<TResponse>> => {
  if (canUseCloudContainer()) {
    try {
      const response = await Taro.cloud.callContainer<TResponse, TData>({
        config: {
          env: CLOUDRUN_ENV,
        },
        path,
        method,
        header: {
          'X-WX-SERVICE': CLOUDRUN_SERVICE,
          ...header,
        },
        data,
      })

      return {
        data: response.data,
        statusCode: response.statusCode,
        header: response.header,
      }
    } catch (error) {
      console.warn('callContainer failed, fallback to request', error)
    }
  }

  const response = await Taro.request<TResponse>({
    url: `${API_BASE}${path}`,
    method,
    header,
    data,
  })

  return {
    data: response.data,
    statusCode: response.statusCode,
    header: response.header,
  }
}
