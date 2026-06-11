import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWechatRefundRequest,
  exchangeWechatLoginCode,
  createWechatJsapiPrepay,
  decryptWechatPayResource,
  encryptWechatPayResourceForTest,
  queryWechatRefund,
  resolveWechatPayAppId,
  type WechatPayConfig,
} from './wechat-pay.js'

test('decrypts WeChat Pay API v3 notification resource', () => {
  const apiV3Key = '12345678901234567890123456789012'
  const plain = {
    out_trade_no: 'PAY202606030001',
    transaction_id: '420000000020260603000001',
    trade_state: 'SUCCESS',
    success_time: '2026-06-03T10:00:00+08:00',
    amount: {
      payer_total: 23800,
      total: 23800,
    },
  }

  const resource = encryptWechatPayResourceForTest(apiV3Key, plain)
  const decrypted = decryptWechatPayResource(apiV3Key, resource)

  assert.equal(decrypted.out_trade_no, plain.out_trade_no)
  assert.equal(decrypted.trade_state, 'SUCCESS')
  assert.equal(decrypted.amount?.payer_total, 23800)
})

test('selects an allowed AppID for merchants bound to multiple mini programs', async () => {
  const config: WechatPayConfig = {
    mode: 'mock',
    loginMode: 'mock',
    appIds: ['wx_mini_one', 'wx_mini_two'],
    appSecrets: {},
    mchId: 'demo_mchid',
    merchantSerialNo: 'demo_serial_no',
    notifyUrl: 'https://example.com/api/payments/wechat/notify',
  }

  const selected = resolveWechatPayAppId(config, 'wx_mini_two')
  const prepay = await createWechatJsapiPrepay(config, {
    appId: 'wx_mini_two',
    description: '颐年智陪陪诊服务',
    outTradeNo: 'PAY202606030001',
    amountFen: 23800,
    payerOpenId: 'wx_family_demo',
  })

  assert.equal(selected, 'wx_mini_two')
  assert.equal(prepay.payParams.appId, 'wx_mini_two')
  assert.throws(
    () => resolveWechatPayAppId(config, 'wx_not_bound'),
    /wechat_appid_not_allowed/,
  )
})

test('exchanges mini program login code in mock mode', async () => {
  const config: WechatPayConfig = {
    mode: 'mock',
    loginMode: 'mock',
    appIds: ['wx_mini_one'],
    appSecrets: {},
    mchId: 'demo_mchid',
    merchantSerialNo: 'demo_serial_no',
    notifyUrl: 'https://example.com/api/payments/wechat/notify',
  }

  const session = await exchangeWechatLoginCode(config, {
    appId: 'wx_mini_one',
    code: 'login-code-001',
  })

  assert.equal(session.openId, 'mock_openid_wx_mini_one_login-code-001')
  assert.equal(session.appId, 'wx_mini_one')
})

test('creates and queries a WeChat refund in mock mode', async () => {
  const config: WechatPayConfig = {
    mode: 'mock',
    loginMode: 'mock',
    appIds: ['wx_mini_one'],
    appSecrets: {},
    mchId: 'demo_mchid',
    merchantSerialNo: 'demo_serial_no',
    notifyUrl: 'https://example.com/api/payments/wechat/notify',
    refundNotifyUrl: 'https://example.com/api/payments/wechat/refund-notify',
  }

  const refund = await createWechatRefundRequest(config, {
    outTradeNo: 'PAY202606050001',
    outRefundNo: 'REF202606050001',
    refundAmountFen: 23800,
    totalAmountFen: 23800,
    reason: '家属取消陪诊',
  })
  const queried = await queryWechatRefund(config, {
    outRefundNo: refund.out_refund_no,
  })
  const resource = encryptWechatPayResourceForTest('12345678901234567890123456789012', {
    out_refund_no: refund.out_refund_no,
    refund_id: refund.refund_id,
    refund_status: 'SUCCESS',
    success_time: '2026-06-05T10:05:00+08:00',
  })
  const decrypted = decryptWechatPayResource('12345678901234567890123456789012', resource)

  assert.equal(refund.status, 'SUCCESS')
  assert.equal(queried.out_refund_no, 'REF202606050001')
  assert.equal(decrypted.out_refund_no, 'REF202606050001')
  assert.equal(decrypted.refund_status, 'SUCCESS')
})
