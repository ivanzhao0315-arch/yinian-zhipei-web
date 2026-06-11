import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getAdminCurrentProgressLabel,
  getAdminNextAction,
  getAdminProgressPercent,
  getAdminWorkStage,
  isWaitingAssign,
  isWaitingPayment,
  sortAdminWorkQueue,
  type AdminWorkbenchOrder,
} from './admin-workbench'

function order(input: Partial<AdminWorkbenchOrder> & Pick<AdminWorkbenchOrder, 'id' | 'status'>): AdminWorkbenchOrder {
  return {
    visitDate: '2026-06-08',
    visitTime: '09:00',
    ...input,
  }
}

describe('admin workbench order logic', () => {
  it('sorts the work queue by operational priority before visit time', () => {
    const orders = [
      order({ id: 'service', status: 'in_service', visitTime: '08:00', assignedEscortId: 'esc_1' }),
      order({ id: 'payment', status: 'confirmed', visitTime: '08:30', payment: { status: 'pending' } }),
      order({ id: 'done', status: 'completed', visitTime: '07:00' }),
      order({ id: 'assign', status: 'confirmed', visitTime: '07:30', payment: { status: 'paid' } }),
      order({ id: 'confirm', status: 'pending_confirmation', visitTime: '10:00' }),
      order({ id: 'exception', status: 'assigned', visitTime: '11:00', exceptions: [{ handled: false }] }),
    ]

    assert.deepEqual(sortAdminWorkQueue(orders).map((item) => item.id), [
      'exception',
      'confirm',
      'payment',
      'assign',
      'service',
    ])
  })

  it('does not mark an order as assignable before payment is paid', () => {
    const unpaidOrder = order({ id: 'unpaid', status: 'confirmed' })
    const paidOrder = order({ id: 'paid', status: 'confirmed', payment: { status: 'paid' } })

    assert.equal(isWaitingPayment(unpaidOrder), true)
    assert.equal(isWaitingAssign(unpaidOrder), false)
    assert.equal(isWaitingPayment(paidOrder), false)
    assert.equal(isWaitingAssign(paidOrder), true)
  })

  it('treats unhandled exceptions as the highest priority regardless of service status', () => {
    const stage = getAdminWorkStage(order({
      id: 'risk',
      status: 'in_service',
      assignedEscortId: 'esc_1',
      exceptions: [{ handled: false }],
    }))

    assert.equal(stage.key, 'exception')
    assert.equal(stage.priority, 0)
    assert.equal(getAdminNextAction({ id: 'risk', status: 'in_service', exceptions: [{ handled: false }] }), '运营介入：联系陪诊员/家属，记录处理结果')
  })

  it('returns clear next actions for payment, assignment and service progress', () => {
    assert.equal(getAdminNextAction(order({ id: 'confirm', status: 'pending_confirmation' })), '电话确认医院科室、就诊时间、费用边界')
    assert.equal(getAdminNextAction(order({ id: 'payment', status: 'confirmed', payment: { status: 'pending' } })), '同步微信支付，确认已支付后派单')
    assert.equal(getAdminNextAction(order({ id: 'assign', status: 'confirmed', payment: { status: 'paid' } })), '选择空闲陪诊员派单')
    assert.equal(getAdminNextAction(order({
      id: 'service',
      status: 'in_service',
      assignedEscortId: 'esc_1',
      progress: [{ stepKey: 'contacted_family', stepLabel: '已联系家属' }],
    })), '推进：已出发')
  })

  it('calculates progress labels and percentages from recorded steps', () => {
    const serviceOrder = order({
      id: 'service',
      status: 'in_service',
      assignedEscortId: 'esc_1',
      progress: [
        { stepKey: 'contacted_family', stepLabel: '已联系家属' },
        { stepKey: 'departed', stepLabel: '已出发' },
      ],
    })

    assert.equal(getAdminCurrentProgressLabel(serviceOrder), '已出发')
    assert.equal(getAdminProgressPercent(serviceOrder), 20)
  })
})
