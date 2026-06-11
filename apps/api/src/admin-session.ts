import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 'v1'
const DEFAULT_TTL_SECONDS = 60 * 60 * 12

type CreateAdminSessionOptions = {
  userId: string
  secret: string
  now?: number
  ttlSeconds?: number
}

type VerifyAdminSessionOptions = {
  secret: string
  now?: number
}

type AdminSessionPayload = {
  role: 'admin'
  userId: string
  expiresAt: number
}

const encodeJson = (value: AdminSessionPayload) =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

const decodeJson = (value: string): AdminSessionPayload | undefined => {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<AdminSessionPayload>
    if (parsed.role !== 'admin' || !parsed.userId || typeof parsed.expiresAt !== 'number') {
      return undefined
    }
    return {
      role: 'admin',
      userId: parsed.userId,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return undefined
  }
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(`${TOKEN_VERSION}.${payload}`).digest('base64url')

const equalSignature = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const createAdminSessionToken = ({
  userId,
  secret,
  now = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: CreateAdminSessionOptions) => {
  const payload = encodeJson({
    role: 'admin',
    userId,
    expiresAt: now + ttlSeconds * 1000,
  })
  return `${TOKEN_VERSION}.${payload}.${sign(payload, secret)}`
}

export const verifyAdminSessionToken = (
  token: string | undefined,
  { secret, now = Date.now() }: VerifyAdminSessionOptions,
) => {
  if (!token || !secret) return undefined

  const [version, payload, signature, ...extra] = token.split('.')
  if (version !== TOKEN_VERSION || !payload || !signature || extra.length) {
    return undefined
  }
  if (!equalSignature(signature, sign(payload, secret))) {
    return undefined
  }

  const session = decodeJson(payload)
  if (!session || session.expiresAt <= now) {
    return undefined
  }
  return session
}

export type { AdminSessionPayload }
