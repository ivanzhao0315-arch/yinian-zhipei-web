const API_BASE =
  process.env.TARO_APP_API_BASE || 'https://express-pahl-266268-8-1440105299.sh.run.tcloudbase.com'
const APP_ID = 'wx75520fafc22173f5'
const CLOUDRUN_ENV = process.env.TARO_APP_CLOUDRUN_ENV || 'prod-d8gut2f8g6bae46bb'
const CLOUDRUN_SERVICE = process.env.TARO_APP_CLOUDRUN_SERVICE || 'express-pahl'
const USE_CLOUDRUN_CONTAINER = process.env.TARO_APP_USE_CLOUDRUN_CONTAINER !== 'false'

export { API_BASE, APP_ID, CLOUDRUN_ENV, CLOUDRUN_SERVICE, USE_CLOUDRUN_CONTAINER }
