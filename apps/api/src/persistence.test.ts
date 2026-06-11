import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { servicePackages } from '@yinian-zhipei/shared'
import { createSqliteStore } from './sqlite-store.js'

test('does not seed demo data unless explicitly requested', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-no-seed-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const emptyStore = await createSqliteStore({ databasePath })
    assert.equal((await emptyStore.listEscorts()).length, 0)
    assert.equal((await emptyStore.listAdminOrders({})).length, 0)
    await emptyStore.close()

    const seededStore = await createSqliteStore({ databasePath, seedDemoData: true })
    assert.equal((await seededStore.listEscorts()).length, 4)
    assert.equal((await seededStore.listAdminOrders({})).length, 1)
    await seededStore.close()
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('cleans demo data without removing real operating records', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-clean-demo-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const testOrder = await store.createOrder({
      hospitalName: '兰州大学第一医院',
      visitDate: '2026-06-05',
      visitTime: '09:30',
      servicePackage: servicePackages.halfDay.key,
      contactName: '验收用户',
      contactPhone: '13900000001',
      elderRelation: '父亲',
    })
    const realOrder = await store.createOrder(
      {
        hospitalName: '甘肃省人民医院',
        visitDate: '2026-06-09',
        visitTime: '10:30',
        servicePackage: servicePackages.halfDay.key,
        contactName: '真实用户',
        contactPhone: '17701322065',
        elderRelation: '母亲',
      },
      { userId: 'real_user' },
    )
    const realEscort = await store.createEscort({
      name: '真实陪诊员',
      phone: '17700000001',
      familiarHospitals: ['甘肃省人民医院'],
      status: 'available',
    })

    const result = await store.cleanupDemoData()
    const orders = await store.listAdminOrders({})
    const escorts = await store.listEscorts()
    const accessCodes = await store.listEscortAccessCodes()
    await store.close()

    assert.equal(result.ordersDeleted, 2)
    assert.equal(orders.some((order) => order.id === testOrder.orderId), false)
    assert.equal(orders.some((order) => order.id === realOrder.orderId), true)
    assert.deepEqual(escorts.map((escort) => escort.id), [realEscort.id])
    assert.equal(accessCodes.length, 0)
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('persists an order in SQLite and reads it back through a fresh store', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const firstStore = await createSqliteStore({ databasePath })
    await firstStore.resetDemoData()

    const created = await firstStore.createOrder({
      hospitalName: '甘肃省人民医院',
      departmentName: '骨科',
      visitDate: '2026-06-06',
      visitTime: '09:00',
      servicePackage: servicePackages.halfDay.key,
      contactName: '王先生',
      contactPhone: '13800138001',
      elderRelation: '母亲',
      specialNotes: '需要陪同做检查',
    })
    await firstStore.close()

    const secondStore = await createSqliteStore({ databasePath })
    const order = await secondStore.findOrder(created.orderId)
    await secondStore.close()

    assert.equal(order?.orderNo, created.orderNo)
    assert.equal(order?.hospitalName, '甘肃省人民医院')
    assert.equal(order?.estimatedPrice, servicePackages.halfDay.priceFrom)
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('scopes family orders and escort tasks by actor identity', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-auth-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const first = await store.createOrder(
      {
        hospitalName: '甘肃省人民医院',
        departmentName: '骨科',
        visitDate: '2026-06-06',
        visitTime: '09:00',
        servicePackage: servicePackages.halfDay.key,
        contactName: '王先生',
        contactPhone: '13800138001',
        elderRelation: '母亲',
      },
      { userId: 'family_a' },
    )
    const second = await store.createOrder(
      {
        hospitalName: '兰州大学第二医院',
        departmentName: '眼科',
        visitDate: '2026-06-07',
        visitTime: '10:00',
        servicePackage: servicePackages.singleTask.key,
        contactName: '赵女士',
        contactPhone: '13800138002',
        elderRelation: '父亲',
      },
      { userId: 'family_b' },
    )

    await store.confirmOrder(first.orderId, { customerServiceNote: '已电话确认' })
    await store.assignOrder(first.orderId, 'esc_003')
    await store.confirmOrder(second.orderId, { customerServiceNote: '已电话确认' })
    await store.assignOrder(second.orderId, 'esc_004')

    const familyAOrders = await store.listMyOrders('family_a')
    const familyBOrderFromA = await store.findOrderForUser(second.orderId, 'family_a')
    const escortThreeTasks = await store.listEscortTasks('esc_003')
    await assert.rejects(
      () =>
        store.updateProgress(
          second.orderId,
          { stepKey: 'met_elder', note: '尝试更新非本人任务' },
          { escortId: 'esc_003' },
        ),
      /forbidden/,
    )

    await store.close()

    assert.deepEqual(
      familyAOrders.map((order) => order.orderNo),
      [first.orderNo],
    )
    assert.equal(familyBOrderFromA, undefined)
    assert.deepEqual(
      escortThreeTasks.map((order) => order.orderNo),
      [first.orderNo],
    )
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('upserts a service summary and completes the order without duplicate finish progress', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-summary-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const created = await store.createOrder(
      {
        hospitalName: '兰州大学第一医院',
        departmentName: '心内科',
        visitDate: '2026-06-08',
        visitTime: '08:30',
        servicePackage: servicePackages.halfDay.key,
        contactName: '李女士',
        contactPhone: '13800138003',
        elderRelation: '父亲',
      },
      { userId: 'family_summary' },
    )
    await store.confirmOrder(created.orderId, { customerServiceNote: '已电话确认' })
    await store.assignOrder(created.orderId, 'esc_003')
    await store.updateProgress(created.orderId, { stepKey: 'met_elder', note: '已见到老人' }, { escortId: 'esc_003' })

    const firstSummary = await store.upsertServiceSummary(
      created.orderId,
      {
        actualDurationMinutes: 210,
        visitResult: '已完成心内科复诊，医生开具复查建议。',
        followUpAdvice: '两周后携带检查报告复诊，按医嘱服药。',
        overtimeMinutes: 0,
        operatorNote: '家属已通过微信同步知悉。',
      },
      { escortId: 'esc_003' },
    )
    const updatedSummary = await store.upsertServiceSummary(created.orderId, {
      actualDurationMinutes: 225,
      visitResult: '已完成心内科复诊、缴费和取药。',
      followUpAdvice: '两周后复诊，药品按早晚分次服用。',
      overtimeMinutes: 15,
      operatorNote: '运营复核后更新。',
    })

    const familyOrder = await store.findOrderForUser(created.orderId, 'family_summary')
    const escort = (await store.listEscorts()).find((item) => item.id === 'esc_003')
    await store.close()

    assert.equal(firstSummary.status, 'completed')
    assert.equal(updatedSummary.serviceSummary?.actualDurationMinutes, 225)
    assert.equal(updatedSummary.serviceSummary?.visitResult, '已完成心内科复诊、缴费和取药。')
    assert.equal(familyOrder?.status, 'completed')
    assert.equal(familyOrder?.serviceSummary?.followUpAdvice, '两周后复诊，药品按早晚分次服用。')
    assert.equal(familyOrder?.progress.filter((item) => item.stepKey === 'service_finished').length, 1)
    assert.equal(escort?.status, 'available')
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('persists demo login identities for family, admin, and escort binding', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-login-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const firstFamilyLogin = await store.upsertFamilyUserByOpenId({
      openId: 'wx_family_001',
      nickname: '张女士',
      phone: '13800138000',
    })
    const secondFamilyLogin = await store.upsertFamilyUserByOpenId({
      openId: 'wx_family_001',
      nickname: '张女士更新',
    })
    const adminLogin = await store.verifyAdminLogin({
      username: 'admin',
      password: 'admin123',
    })
    const escortBinding = await store.bindEscortOpenId({
      openId: 'wx_escort_003',
      escortId: 'esc_003',
    })
    const escortActor = await store.findEscortBindingByOpenId('wx_escort_003')
    const unknownEscortActor = await store.findEscortBindingByOpenId('wx_missing_escort')
    await store.close()

    assert.equal(firstFamilyLogin.role, 'family')
    assert.equal(firstFamilyLogin.userId, secondFamilyLogin.userId)
    assert.equal(secondFamilyLogin.nickname, '张女士更新')
    assert.equal(adminLogin?.role, 'admin')
    assert.equal(adminLogin?.userId, 'admin_demo')
    assert.equal(escortBinding.role, 'escort')
    assert.equal(escortBinding.escortId, 'esc_003')
    assert.deepEqual(escortActor, {
      role: 'escort',
      userId: 'wx_escort_003',
      openId: 'wx_escort_003',
      escortId: 'esc_003',
      escortName: '周敏',
    })
    assert.equal(unknownEscortActor, undefined)
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('creates, edits, and disables an escort profile', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-escort-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const created = await store.createEscort({
      name: '王芳',
      phone: '139-9311-0005',
      familiarHospitals: ['兰州大学第一医院', '甘肃省人民医院'],
    })
    const updated = await store.updateEscort(created.id, {
      name: '王芳老师',
      familiarHospitals: ['兰州大学第一医院'],
    })
    const disabled = await store.updateEscortStatus(created.id, 'off')
    const allEscorts = await store.listEscorts()
    await store.close()

    assert.equal(created.phone, '13993110005')
    assert.equal(updated.name, '王芳老师')
    assert.deepEqual(updated.familiarHospitals, ['兰州大学第一医院'])
    assert.equal(disabled.status, 'off')
    assert.ok(allEscorts.some((escort) => escort.id === created.id))
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('lets admins edit and cancel an order with operation logs', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-order-ops-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const created = await store.createOrder({
      hospitalName: '兰州大学第一医院',
      departmentName: '心内科',
      visitDate: '2026-06-08',
      visitTime: '09:30',
      servicePackage: 'half_day',
      contactName: '张女士',
      contactPhone: '13800138000',
      elderRelation: '父亲',
      specialNotes: '腿脚不便',
    })
    const updated = await store.updateAdminOrder(created.orderId, {
      hospitalName: '甘肃省人民医院',
      departmentName: '骨科',
      visitDate: '2026-06-09',
      visitTime: '10:00',
      contactName: '李女士',
      contactPhone: '13900139000',
      elderRelation: '母亲',
      specialNotes: '需要轮椅',
      customerServiceNote: '电话确认：家属要求提前半小时到院',
      estimatedPrice: 258,
    })
    const cancelled = await store.cancelOrder(created.orderId, '家属改期，订单取消')
    const detail = await store.getAdminOrder(created.orderId)
    await store.close()

    assert.equal(updated.hospitalName, '甘肃省人民医院')
    assert.equal(updated.departmentName, '骨科')
    assert.equal(updated.contactPhone, '13900139000')
    assert.equal(updated.customerServiceNote, '电话确认：家属要求提前半小时到院')
    assert.equal(updated.estimatedPrice, 258)
    assert.equal(cancelled.status, 'cancelled')
    assert.ok(detail?.logs.some((log) => log.action === 'order_updated'))
    assert.ok(detail?.logs.some((log) => log.action === 'order_cancelled'))
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('creates and settles a WeChat payment record for an order', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-payment-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    const created = await store.createWechatPayment({
      orderId: 'ord_001',
      userId: 'user_demo',
      payerOpenId: 'wx_family_demo',
    })
    const unpaidOrder = await store.findOrderForUser('ord_001', 'user_demo')

    await store.markWechatPaymentPaid({
      outTradeNo: created.outTradeNo,
      transactionId: '420000000020260603000001',
      paidAmountFen: created.amountFen,
      paidAt: '2026-06-03T10:00:00+08:00',
    })
    await store.markWechatPaymentPaidByOrderId({
      orderId: 'ord_001',
      transactionId: '420000000020260603000002',
      paidAt: '2026-06-03T10:05:00+08:00',
    })
    const paidOrder = await store.findOrderForUser('ord_001', 'user_demo')
    await store.close()

    assert.equal(created.amountFen, 23800)
    assert.equal(unpaidOrder?.payment?.status, 'pending')
    assert.equal(paidOrder?.payment?.status, 'paid')
    assert.equal(paidOrder?.payment?.transactionId, '420000000020260603000002')
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

test('creates and updates one refund record for a paid order', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'yinian-zhipei-api-refund-'))
  const databasePath = join(workspace, 'test.db')

  try {
    const store = await createSqliteStore({ databasePath })
    await store.resetDemoData()

    await store.createWechatPayment({
      orderId: 'ord_001',
      userId: 'user_demo',
      payerOpenId: 'wx_family_demo',
    })
    const payment = await store.markWechatPaymentPaidByOrderId({
      orderId: 'ord_001',
      transactionId: '420000000020260605000001',
      paidAt: '2026-06-05T10:00:00+08:00',
    })
    const created = await store.createWechatRefund({
      orderId: payment.orderId,
      reason: '家属取消陪诊',
    })
    const duplicate = await store.createWechatRefund({
      orderId: payment.orderId,
      reason: '重复点击退款',
    })
    const updated = await store.updateWechatRefundStatus(created.outRefundNo, {
      refundId: '503000000020260605000001',
      status: 'SUCCESS',
      successTime: '2026-06-05T10:05:00+08:00',
    })
    const order = await store.getAdminOrder(payment.orderId)
    await store.close()

    assert.equal(created.amountFen, payment.amountFen)
    assert.equal(duplicate.id, created.id)
    assert.equal(updated.status, 'success')
    assert.equal(order?.refund?.outRefundNo, created.outRefundNo)
    assert.equal(order?.refund?.status, 'success')
    assert.ok(order?.logs.some((log) => log.action === 'refund_requested'))
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})
