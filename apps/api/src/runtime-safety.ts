type RuntimeFlags = {
  nodeEnv?: string
  wechatPayMode?: string
  seedDemoData?: string
  enableDevEndpoints?: string
}

const isProductionRuntime = (flags: RuntimeFlags = process.env) =>
  flags.nodeEnv === 'production' || flags.wechatPayMode === 'live'

const shouldSeedDemoData = (flags: RuntimeFlags = process.env) =>
  !isProductionRuntime(flags) && flags.seedDemoData === 'true'

const allowDevEndpoints = (flags: RuntimeFlags = process.env) =>
  !isProductionRuntime(flags) && flags.enableDevEndpoints !== 'false'

const allowBodyOpenIdLogin = (flags: RuntimeFlags = process.env) =>
  !isProductionRuntime(flags)

export {
  allowBodyOpenIdLogin,
  allowDevEndpoints,
  isProductionRuntime,
  shouldSeedDemoData,
}

export type { RuntimeFlags }
