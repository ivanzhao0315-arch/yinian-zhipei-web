import { timingSafeEqual } from 'node:crypto'

type AdminLoginInput = {
  username: string
  password: string
}

type EnvAdminConfig = {
  username?: string
  password?: string
  userId?: string
  displayName?: string
}

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const verifyEnvAdminLogin = (
  input: AdminLoginInput,
  config: EnvAdminConfig,
) => {
  if (!config.password) {
    return undefined
  }

  const username = config.username || 'admin'
  if (!safeEqual(input.username, username) || !safeEqual(input.password, config.password)) {
    return undefined
  }

  return {
    role: 'admin' as const,
    userId: config.userId || 'admin_env',
    username,
    displayName: config.displayName || '运营管理员',
  }
}

export type { AdminLoginInput, EnvAdminConfig }
