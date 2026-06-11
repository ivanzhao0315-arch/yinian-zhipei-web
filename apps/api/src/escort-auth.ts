type ExchangeLoginCodeInput = {
  appId?: string
  code: string
}

type ExchangeLoginCodeResult = {
  openId: string
}

type ResolveEscortBindOpenIdInput = ExchangeLoginCodeInput & {
  cloudOpenId?: string
  exchangeLoginCode: (input: ExchangeLoginCodeInput) => Promise<ExchangeLoginCodeResult>
}

export const resolveEscortBindOpenId = async ({
  cloudOpenId,
  appId,
  code,
  exchangeLoginCode,
}: ResolveEscortBindOpenIdInput) => {
  const injectedOpenId = cloudOpenId?.trim()
  if (injectedOpenId) {
    return injectedOpenId
  }

  const session = await exchangeLoginCode({ appId, code })
  return session.openId
}
