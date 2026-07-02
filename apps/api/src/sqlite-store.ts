import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  orderStatuses,
  progressStepList,
  servicePackages,
  type OrderStatus,
  type ProgressStepKey,
  type ServicePackageKey,
} from '@yinian-zhipei/shared'

type EscortStatus = 'available' | 'busy' | 'off'
type RefundStatus = 'pending' | 'processing' | 'success' | 'closed' | 'abnormal'

type CreateOrderInput = {
  hospitalName: string
  departmentName?: string
  visitDate: string
  visitTime: string
  servicePackage: ServicePackageKey
  contactName: string
  contactPhone: string
  elderRelation: string
  specialNotes?: string
}

type UpdateAdminOrderInput = Partial<CreateOrderInput> & {
  estimatedPrice?: number
  customerServiceNote?: string
}

type UpsertServiceSummaryInput = {
  actualDurationMinutes: number
  visitResult: string
  followUpAdvice: string
  overtimeMinutes?: number
  operatorNote: string
}

type ServiceSummaryScope = {
  escortId?: string
  actorType?: 'admin' | 'escort'
  createdBy?: string
}

type OrderRow = {
  id: string
  order_no: string
  user_id: string
  hospital_name: string
  department_name: string | null
  visit_date: string
  visit_time: string
  service_package: string
  estimated_price: number
  contact_name: string
  contact_phone: string
  elder_relation: string
  special_notes: string | null
  status: string
  assigned_escort_id: string | null
  customer_service_note: string | null
  created_at: string
  updated_at: string
}

type EscortRow = {
  id: string
  name: string
  phone: string
  familiar_hospitals: string
  status: string
}

type EscortPhoneWhitelistRow = {
  id: string
  phone: string
  escort_id: string | null
  access_code: string | null
  name: string
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

type ProgressRow = {
  id: string
  order_id: string
  step_key: string
  step_label: string
  status: string
  note: string | null
  image_urls: string
  created_by: string
  created_at: string
}

type ExceptionRow = {
  id: string
  order_id: string
  exception_type: string
  description: string
  handled: number
  resolution: string | null
  created_at: string
  updated_at: string
}

type SummaryRow = {
  id: string
  order_id: string
  actual_duration_minutes: number
  visit_result: string
  follow_up_advice: string
  overtime_minutes: number
  operator_note: string
  created_by: string
  created_at: string
  updated_at: string
}

type PaymentRow = {
  id: string
  order_id: string
  user_id: string
  channel: string
  out_trade_no: string
  prepay_id: string | null
  transaction_id: string | null
  payer_open_id: string
  amount_fen: number
  paid_amount_fen: number | null
  status: string
  paid_at: string | null
  created_at: string
  updated_at: string
}

type RefundRow = {
  id: string
  order_id: string
  payment_id: string
  channel: string
  out_refund_no: string
  refund_id: string | null
  amount_fen: number
  status: string
  reason: string | null
  success_time: string | null
  created_at: string
  updated_at: string
}

type LogRow = {
  id: string
  order_id: string
  actor_type: string
  action: string
  from_status: string | null
  to_status: string | null
  note: string | null
  created_at: string
}

type NotificationLogRow = {
  id: string
  order_id: string | null
  event: string
  recipient_type: string
  recipient_id: string
  channel: string
  template_id: string | null
  status: string
  payload: string
  error_message: string | null
  created_at: string
}

type StoreOptions = {
  databasePath: string
  seedDemoData?: boolean
}

type FamilyScope = {
  userId: string
}

type FamilyLoginInput = {
  openId: string
  nickname?: string
  phone?: string
}

type CreatePaymentInput = {
  orderId: string
  userId: string
  payerOpenId: string
}

type MarkPaymentPaidInput = {
  outTradeNo: string
  transactionId?: string
  paidAmountFen?: number
  paidAt?: string
}

type MarkPaymentPaidByOrderInput = {
  orderId: string
  transactionId?: string
  paidAt?: string
}

type CreateRefundInput = {
  orderId: string
  amountFen?: number
  reason?: string
}

type UpdateRefundStatusInput = {
  refundId?: string
  status: string
  successTime?: string
}

type AdminLoginInput = {
  username: string
  password: string
}

type EscortBindInput = {
  openId: string
  escortId: string
  phone?: string
}

type CreateEscortInput = {
  name: string
  phone: string
  familiarHospitals: string[]
  status?: EscortStatus
}

type UpdateEscortInput = Partial<CreateEscortInput>

type CreateEscortPhoneWhitelistInput = {
  phone?: string
  name: string
  escortId: string
  accessCode: string
  note?: string
}

type NotificationLogInput = {
  orderId?: string
  event: string
  recipientType: string
  recipientId: string
  channel: string
  templateId?: string
  status: string
  payload: unknown
  errorMessage?: string
}

const now = () => new Date().toISOString()

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`

const parseJsonArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

const stringifyArray = (value: string[]) => JSON.stringify(value)

const normalizePhone = (phone: string) => phone.replace(/\D/g, '')

const normalizeHospitalList = (value?: string[]) =>
  Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)))

const requiredText = (value: string | undefined, field: string) => {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`invalid_${field}`)
  }
  return normalized
}

const normalizeRefundStatus = (status: string): RefundStatus => {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'success') return 'success'
  if (normalized === 'processing') return 'processing'
  if (normalized === 'closed') return 'closed'
  if (normalized === 'abnormal') return 'abnormal'
  if (normalized === 'pending') return 'pending'
  throw new Error('invalid_refund_status')
}

const assertEscortStatus = (status: string): EscortStatus => {
  if (status === 'available' || status === 'busy' || status === 'off') return status
  throw new Error('invalid_escort_status')
}

const assertEscortProfile = (input: {
  name?: string
  phone?: string
  familiarHospitals?: string[]
  status?: string
}) => {
  const name = input.name?.trim()
  const phone = input.phone === undefined ? undefined : normalizePhone(input.phone)
  const familiarHospitals = normalizeHospitalList(input.familiarHospitals)
  const status = input.status === undefined ? undefined : assertEscortStatus(input.status)

  if (input.name !== undefined && !name) {
    throw new Error('invalid_escort_profile')
  }
  if (input.phone !== undefined && (!phone || phone.length < 7)) {
    throw new Error('invalid_phone')
  }
  if (input.familiarHospitals !== undefined && familiarHospitals.length === 0) {
    throw new Error('invalid_escort_profile')
  }

  return {
    name,
    phone,
    familiarHospitals,
    status,
  }
}

export class SqliteStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec('PRAGMA foreign_keys = ON')
    this.createTables()
  }

  async close() {
    this.db.close()
  }

  async resetDemoData() {
    const timestamp = now()

    this.transaction(() => {
      this.db.exec(`
        DELETE FROM service_summaries;
        DELETE FROM refunds;
        DELETE FROM payments;
        DELETE FROM notification_logs;
        DELETE FROM order_exceptions;
        DELETE FROM order_progress;
        DELETE FROM order_logs;
        DELETE FROM orders;
        DELETE FROM escort_openid_bindings;
        DELETE FROM escort_phone_whitelist;
        DELETE FROM admin_users;
        DELETE FROM users;
        DELETE FROM escorts;
      `)

      const insertEscort = this.db.prepare(`
        INSERT INTO escorts (id, name, phone, familiar_hospitals, status)
        VALUES (?, ?, ?, ?, ?)
      `)
      insertEscort.run('esc_001', '李霞', '13993110001', stringifyArray(['兰州大学第一医院']), 'busy')
      insertEscort.run('esc_002', '马强', '13993110002', stringifyArray(['兰州大学第二医院']), 'busy')
      insertEscort.run('esc_003', '周敏', '13993110003', stringifyArray(['甘肃省人民医院']), 'available')
      insertEscort.run(
        'esc_004',
        '陈伟',
        '13993110004',
        stringifyArray(['甘肃省中医院', '兰州市第一人民医院']),
        'available',
      )

      const insertWhitelist = this.db.prepare(`
        INSERT INTO escort_phone_whitelist (
          id, phone, escort_id, access_code, name, status, note, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      insertWhitelist.run('ewl_001', '13993110001', 'esc_001', 'lixia2026', '李霞', 'active', '演示陪诊员口令', timestamp, timestamp)
      insertWhitelist.run('ewl_002', '13993110002', 'esc_002', 'maqiang2026', '马强', 'active', '演示陪诊员口令', timestamp, timestamp)
      insertWhitelist.run('ewl_003', '13993110003', 'esc_003', 'zhoumin2026', '周敏', 'active', '演示陪诊员口令', timestamp, timestamp)
      insertWhitelist.run('ewl_004', '13993110004', 'esc_004', 'chenwei2026', '陈伟', 'active', '演示陪诊员口令', timestamp, timestamp)

      this.db
        .prepare(`
          INSERT INTO orders (
            id, order_no, user_id, hospital_name, department_name, visit_date, visit_time,
            service_package, estimated_price, contact_name, contact_phone, elder_relation,
            special_notes, status, assigned_escort_id, customer_service_note, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'ord_001',
          'LZ202606030001',
          'user_demo',
          '兰州大学第一医院',
          '心内科',
          '2026-06-04',
          '08:30',
          servicePackages.halfDay.key,
          servicePackages.halfDay.priceFrom,
          '张女士',
          '13800138000',
          '父亲',
          '老人行动较慢，可能需要轮椅。',
          orderStatuses.pendingConfirmation,
          null,
          null,
          timestamp,
          timestamp,
        )

      this.db
        .prepare(`
          INSERT INTO admin_users (id, username, password, display_name, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'admin_demo',
          'admin',
          'admin123',
          '演示运营',
          'active',
          timestamp,
          timestamp,
        )
    })
  }

  async seedDemoDataIfEmpty() {
    const escortCount = this.db.prepare('SELECT COUNT(*) AS count FROM escorts').get() as {
      count: number
    }
    const orderCount = this.db.prepare('SELECT COUNT(*) AS count FROM orders').get() as {
      count: number
    }

    if (!escortCount.count || !orderCount.count) {
      await this.resetDemoData()
    }

    const whitelistCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM escort_phone_whitelist')
      .get() as { count: number }

    const timestamp = now()
    const escorts = this.db.prepare('SELECT * FROM escorts ORDER BY id ASC').all() as EscortRow[]
    const insertWhitelist = this.db.prepare(`
      INSERT OR IGNORE INTO escort_phone_whitelist (
        id, phone, escort_id, access_code, name, status, note, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    if (!whitelistCount.count) {
      escorts.forEach((escort) => {
        insertWhitelist.run(
          createId('ewl'),
          escort.phone,
          escort.id,
          `${escort.id.replace('esc_', 'escort')}2026`,
          escort.name,
          'active',
          '由现有陪诊员自动生成口令',
          timestamp,
          timestamp,
        )
      })
    } else {
      escorts.forEach((escort) => {
        insertWhitelist.run(
          createId('ewl'),
          escort.phone,
          escort.id,
          `${escort.id.replace('esc_', 'escort')}2026`,
          escort.name,
          'active',
          '由现有陪诊员自动补齐口令',
          timestamp,
          timestamp,
        )
      })
    }

    escorts.forEach((escort) => {
      this.db
        .prepare(`
          UPDATE escort_phone_whitelist
          SET access_code = ?, updated_at = ?
          WHERE escort_id = ? AND (access_code IS NULL OR access_code = '')
        `)
        .run(`${escort.id.replace('esc_', 'escort')}2026`, timestamp, escort.id)
    })
  }

  async cleanupDemoData() {
    const demoOrderRows = this.db
      .prepare(`
        SELECT id FROM orders
        WHERE id = 'ord_001'
          OR user_id = 'user_demo'
          OR order_no = 'LZ202606030001'
          OR contact_phone IN ('13800138000', '13900000001')
          OR contact_name IN ('张女士', '验收用户')
      `)
      .all() as Array<{ id: string }>
    const demoEscortRows = this.db
      .prepare(`
        SELECT id FROM escorts
        WHERE id IN ('esc_001', 'esc_002', 'esc_003', 'esc_004')
          OR phone IN ('13993110001', '13993110002', '13993110003', '13993110004')
          OR name IN ('李霞', '马强', '周敏', '陈伟')
      `)
      .all() as Array<{ id: string }>
    const orderIds = demoOrderRows.map((row) => row.id)
    const escortIds = demoEscortRows.map((row) => row.id)
    const result = {
      ordersDeleted: 0,
      escortsDeleted: 0,
      accessCodesDeleted: 0,
      usersDeleted: 0,
      adminUsersDeleted: 0,
      relatedRowsDeleted: 0,
    }

    const deleteByIds = (table: string, column: string, ids: string[]) => {
      if (!ids.length) return 0
      const placeholders = ids.map(() => '?').join(', ')
      const statement = this.db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`)
      return Number(statement.run(...ids).changes)
    }

    this.transaction(() => {
      for (const table of [
        'service_summaries',
        'refunds',
        'payments',
        'notification_logs',
        'order_exceptions',
        'order_progress',
        'order_logs',
      ]) {
        result.relatedRowsDeleted += deleteByIds(table, 'order_id', orderIds)
      }

      result.ordersDeleted += deleteByIds('orders', 'id', orderIds)
      result.relatedRowsDeleted += deleteByIds('escort_openid_bindings', 'escort_id', escortIds)

      const whitelistConditions = [
        "phone IN ('13993110001', '13993110002', '13993110003', '13993110004')",
        "access_code IN ('lixia2026', 'maqiang2026', 'zhoumin2026', 'chenwei2026')",
        "name IN ('李霞', '马强', '周敏', '陈伟')",
        "note LIKE '%演示%'",
      ]
      const whitelistParams: string[] = []
      if (escortIds.length) {
        whitelistConditions.push(`escort_id IN (${escortIds.map(() => '?').join(', ')})`)
        whitelistParams.push(...escortIds)
      }
      result.accessCodesDeleted = this.db
        .prepare(`DELETE FROM escort_phone_whitelist WHERE ${whitelistConditions.join(' OR ')}`)
        .run(...whitelistParams).changes as number

      result.escortsDeleted = deleteByIds('escorts', 'id', escortIds)
      result.usersDeleted = this.db
        .prepare("DELETE FROM users WHERE id = 'user_demo' OR open_id LIKE 'mock_openid_%'")
        .run().changes as number
      result.adminUsersDeleted = this.db
        .prepare("DELETE FROM admin_users WHERE id = 'admin_demo' OR (username = 'admin' AND password = 'admin123')")
        .run().changes as number
    })

    return result
  }

  async upsertFamilyUserByOpenId(input: FamilyLoginInput) {
    const timestamp = now()
    const existing = this.db
      .prepare('SELECT * FROM users WHERE open_id = ?')
      .get(input.openId) as
      | {
          id: string
          open_id: string
          nickname: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
      | undefined

    if (existing) {
      this.db
        .prepare(`
          UPDATE users
          SET nickname = COALESCE(?, nickname), phone = COALESCE(?, phone), updated_at = ?
          WHERE id = ?
        `)
        .run(input.nickname ?? null, input.phone ?? null, timestamp, existing.id)

      const updated = this.db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as {
        id: string
        open_id: string
        nickname: string | null
        phone: string | null
      }

      return {
        role: 'family' as const,
        userId: updated.id,
        openId: updated.open_id,
        nickname: updated.nickname ?? undefined,
        phone: updated.phone ?? undefined,
      }
    }

    const userId = createId('user')
    this.db
      .prepare(`
        INSERT INTO users (id, open_id, nickname, phone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        userId,
        input.openId,
        input.nickname ?? null,
        input.phone ?? null,
        timestamp,
        timestamp,
      )

    return {
      role: 'family' as const,
      userId,
      openId: input.openId,
      nickname: input.nickname,
      phone: input.phone,
    }
  }

  async verifyAdminLogin(input: AdminLoginInput) {
    const admin = this.db
      .prepare(`
        SELECT * FROM admin_users
        WHERE username = ? AND password = ? AND status = 'active'
      `)
      .get(input.username, input.password) as
      | {
          id: string
          username: string
          display_name: string
        }
      | undefined

    if (!admin) {
      return undefined
    }

    return {
      role: 'admin' as const,
      userId: admin.id,
      username: admin.username,
      displayName: admin.display_name,
    }
  }

  async listEscortAccessCodes() {
    return this.db
      .prepare('SELECT * FROM escort_phone_whitelist ORDER BY created_at DESC')
      .all()
      .map((row) => this.escortPhoneWhitelistFromRow(row as EscortPhoneWhitelistRow))
  }

  async createEscortAccessCode(input: CreateEscortPhoneWhitelistInput) {
    const accessCode = input.accessCode.trim()
    if (accessCode.length < 4) {
      throw new Error('invalid_escort_access_code')
    }

    const escort = this.findEscortRow(input.escortId)
    if (!escort) {
      throw new Error('escort_not_found')
    }

    const phone = normalizePhone(input.phone ?? escort.phone)
    const timestamp = now()
    const id = createId('ewl')
    this.db
      .prepare(`
        INSERT INTO escort_phone_whitelist (
          id, phone, escort_id, access_code, name, status, note, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
          escort_id = excluded.escort_id,
          access_code = excluded.access_code,
          name = excluded.name,
          status = 'active',
          note = excluded.note,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        phone,
        escort.id,
        accessCode,
        input.name.trim() || escort.name,
        'active',
        input.note ?? null,
        timestamp,
        timestamp,
      )

    const row = this.db
      .prepare('SELECT * FROM escort_phone_whitelist WHERE access_code = ?')
      .get(accessCode) as EscortPhoneWhitelistRow

    return this.escortPhoneWhitelistFromRow(row)
  }

  async verifyEscortAccessCode(accessCodeInput: string) {
    const accessCode = accessCodeInput.trim()
    if (!accessCode) {
      throw new Error('invalid_escort_access_code')
    }

    const row = this.db
      .prepare(`
        SELECT * FROM escort_phone_whitelist
        WHERE access_code = ? AND status = 'active'
      `)
      .get(accessCode) as EscortPhoneWhitelistRow | undefined

    if (!row || !row.escort_id) {
      throw new Error('escort_access_code_not_allowed')
    }

    const escort = this.findEscortRow(row.escort_id)
    if (!escort) {
      throw new Error('escort_not_found')
    }

    return {
      ...this.escortPhoneWhitelistFromRow(row),
      escort: this.escortFromRow(escort),
    }
  }

  async verifyEscortPhone(phoneInput: string) {
    const phone = normalizePhone(phoneInput)
    const row = this.db
      .prepare(`
        SELECT * FROM escort_phone_whitelist
        WHERE phone = ? AND status = 'active'
      `)
      .get(phone) as EscortPhoneWhitelistRow | undefined

    if (!row) {
      throw new Error('escort_phone_not_allowed')
    }

    const whitelist = this.escortPhoneWhitelistFromRow(row)
    const escort = whitelist.escortId ? this.findEscortRow(whitelist.escortId) : undefined

    return {
      ...whitelist,
      escort: escort ? this.escortFromRow(escort) : undefined,
    }
  }

  async updateEscortAccessCodeStatus(id: string, status: 'active' | 'disabled') {
    const timestamp = now()
    const result = this.db
      .prepare('UPDATE escort_phone_whitelist SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, timestamp, id)

    if (!result.changes) {
      throw new Error('whitelist_not_found')
    }

    const row = this.db
      .prepare('SELECT * FROM escort_phone_whitelist WHERE id = ?')
      .get(id) as EscortPhoneWhitelistRow

    return this.escortPhoneWhitelistFromRow(row)
  }

  async bindEscortOpenId(input: EscortBindInput) {
    const escort = this.findEscortRow(input.escortId)
    if (!escort) {
      throw new Error('escort_not_found')
    }

    const timestamp = now()
    this.db
      .prepare(`
        INSERT INTO escort_openid_bindings (open_id, escort_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(open_id) DO UPDATE SET
          escort_id = excluded.escort_id,
          updated_at = excluded.updated_at
      `)
      .run(input.openId, input.escortId, timestamp, timestamp)

    return {
      role: 'escort' as const,
      userId: input.openId,
      openId: input.openId,
      escortId: input.escortId,
      escortName: escort.name,
    }
  }

  async getFamilyOpenIdByUserId(userId: string) {
    const user = this.db
      .prepare('SELECT open_id FROM users WHERE id = ?')
      .get(userId) as { open_id: string } | undefined

    return user?.open_id
  }

  async getEscortOpenIdByEscortId(escortId: string) {
    const binding = this.db
      .prepare(`
        SELECT open_id FROM escort_openid_bindings
        WHERE escort_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(escortId) as { open_id: string } | undefined

    return binding?.open_id
  }

  async findEscortBindingByOpenId(openIdInput: string) {
    const openId = openIdInput.trim()
    if (!openId) {
      return undefined
    }

    const binding = this.db
      .prepare(`
        SELECT binding.open_id, binding.escort_id, escorts.name
        FROM escort_openid_bindings binding
        INNER JOIN escorts ON escorts.id = binding.escort_id
        WHERE binding.open_id = ?
        ORDER BY binding.updated_at DESC
        LIMIT 1
      `)
      .get(openId) as
      | {
          open_id: string
          escort_id: string
          name: string
        }
      | undefined

    if (!binding) {
      return undefined
    }

    return {
      role: 'escort' as const,
      userId: binding.open_id,
      openId: binding.open_id,
      escortId: binding.escort_id,
      escortName: binding.name,
    }
  }

  async createNotificationLog(input: NotificationLogInput) {
    this.db
      .prepare(`
        INSERT INTO notification_logs (
          id, order_id, event, recipient_type, recipient_id, channel, template_id,
          status, payload, error_message, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        createId('ntf'),
        input.orderId ?? null,
        input.event,
        input.recipientType,
        input.recipientId,
        input.channel,
        input.templateId ?? null,
        input.status,
        JSON.stringify(input.payload),
        input.errorMessage ?? null,
        now(),
      )
  }

  async listNotificationLogs(limit = 50) {
    return this.db
      .prepare(`
        SELECT * FROM notification_logs
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit)
      .map((row) => this.notificationLogFromRow(row as NotificationLogRow))
  }

  async createWechatPayment(input: CreatePaymentInput) {
    const order = this.db
      .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
      .get(input.orderId, input.userId) as OrderRow | undefined

    if (!order) {
      throw new Error('order_not_found')
    }

    const existingPending = this.db
      .prepare(`
        SELECT * FROM payments
        WHERE order_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(order.id) as PaymentRow | undefined

    if (existingPending) {
      return this.paymentFromRow(existingPending)
    }

    const amountFen = order.estimated_price * 100
    if (!Number.isInteger(amountFen) || amountFen <= 0) {
      throw new Error('invalid_payment_amount')
    }

    const timestamp = now()
    const tradeTimestamp = timestamp.replace(/\D/g, '').slice(0, 14)
    const tradeNonce = randomBytes(4).toString('hex').toUpperCase()
    const outTradeNo = `PAY${tradeTimestamp}${tradeNonce}`
    const paymentId = createId('pay')

    this.db
      .prepare(`
        INSERT INTO payments (
          id, order_id, user_id, channel, out_trade_no, prepay_id, transaction_id,
          payer_open_id, amount_fen, paid_amount_fen, status, paid_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        paymentId,
        order.id,
        input.userId,
        'wechat',
        outTradeNo,
        null,
        null,
        input.payerOpenId,
        amountFen,
        null,
        'pending',
        null,
        timestamp,
        timestamp,
      )

    return this.paymentFromRow(this.requirePaymentByOutTradeNo(outTradeNo))
  }

  async attachWechatPrepayId(outTradeNo: string, prepayId: string) {
    this.db
      .prepare('UPDATE payments SET prepay_id = ?, updated_at = ? WHERE out_trade_no = ?')
      .run(prepayId, now(), outTradeNo)

    return this.paymentFromRow(this.requirePaymentByOutTradeNo(outTradeNo))
  }

  async markWechatPaymentPaid(input: MarkPaymentPaidInput) {
    const payment = this.requirePaymentByOutTradeNo(input.outTradeNo)
    // 微信回调会重试、管理员可反复同步：只有首次从未支付变为已支付才算跃迁，用于通知去重
    const justPaid = payment.status !== 'paid'
    const timestamp = now()

    this.db
      .prepare(`
        UPDATE payments
        SET status = ?, transaction_id = ?, paid_amount_fen = ?, paid_at = ?, updated_at = ?
        WHERE out_trade_no = ?
      `)
      .run(
        'paid',
        input.transactionId ?? payment.transaction_id,
        input.paidAmountFen ?? payment.amount_fen,
        input.paidAt ?? timestamp,
        timestamp,
        input.outTradeNo,
      )

    return { ...this.paymentFromRow(this.requirePaymentByOutTradeNo(input.outTradeNo)), justPaid }
  }

  async markWechatPaymentPaidByOrderId(input: MarkPaymentPaidByOrderInput) {
    const payment = this.db
      .prepare(`
        SELECT * FROM payments
        WHERE order_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(input.orderId) as PaymentRow | undefined

    if (!payment) {
      throw new Error('payment_not_found')
    }

    return this.markWechatPaymentPaid({
      outTradeNo: payment.out_trade_no,
      transactionId: input.transactionId,
      paidAmountFen: payment.amount_fen,
      paidAt: input.paidAt,
    })
  }

  async createWechatRefund(input: CreateRefundInput) {
    const order = this.requireOrderRow(input.orderId)
    const payment = this.db
      .prepare(`
        SELECT * FROM payments
        WHERE order_id = ? AND status = 'paid'
        ORDER BY paid_at DESC, created_at DESC
        LIMIT 1
      `)
      .get(order.id) as PaymentRow | undefined

    if (!payment) {
      throw new Error('payment_not_paid')
    }

    const existing = this.db
      .prepare(`
        SELECT * FROM refunds
        WHERE order_id = ? AND status IN ('pending', 'processing', 'success')
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(order.id) as RefundRow | undefined
    if (existing) {
      return this.refundFromRow(existing)
    }

    const paidAmountFen = payment.paid_amount_fen ?? payment.amount_fen
    const amountFen = input.amountFen ?? paidAmountFen
    if (!Number.isFinite(amountFen) || amountFen <= 0 || amountFen > paidAmountFen) {
      throw new Error('invalid_refund_amount')
    }

    const timestamp = now()
    const refundTimestamp = timestamp.replace(/\D/g, '').slice(0, 14)
    const refundNonce = randomBytes(4).toString('hex').toUpperCase()
    const outRefundNo = `REF${refundTimestamp}${refundNonce}`
    const refundId = createId('rfd')
    const reason = input.reason?.trim() || '运营发起退款'

    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO refunds (
            id, order_id, payment_id, channel, out_refund_no, refund_id, amount_fen,
            status, reason, success_time, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          refundId,
          order.id,
          payment.id,
          'wechat',
          outRefundNo,
          null,
          amountFen,
          'pending',
          reason,
          null,
          timestamp,
          timestamp,
        )
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'refund_requested',
        fromStatus: order.status as OrderStatus,
        toStatus: order.status as OrderStatus,
        note: reason,
      })
    })

    return this.refundFromRow(this.requireRefundByOutRefundNo(outRefundNo))
  }

  async updateWechatRefundStatus(outRefundNo: string, input: UpdateRefundStatusInput) {
    const refund = this.requireRefundByOutRefundNo(outRefundNo)
    const nextStatus = normalizeRefundStatus(input.status)
    const timestamp = now()

    this.db
      .prepare(`
        UPDATE refunds
        SET refund_id = ?, status = ?, success_time = ?, updated_at = ?
        WHERE out_refund_no = ?
      `)
      .run(
        input.refundId ?? refund.refund_id,
        nextStatus,
        input.successTime ?? refund.success_time,
        timestamp,
        outRefundNo,
      )

    return this.refundFromRow(this.requireRefundByOutRefundNo(outRefundNo))
  }

  async findWechatRefundByOutRefundNo(outRefundNo: string) {
    const refund = this.db
      .prepare('SELECT * FROM refunds WHERE out_refund_no = ?')
      .get(outRefundNo) as RefundRow | undefined
    return refund ? this.refundFromRow(refund) : undefined
  }

  async findLatestWechatRefundForOrder(orderId: string) {
    const refund = this.db
      .prepare(`
        SELECT * FROM refunds
        WHERE order_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(orderId) as RefundRow | undefined
    return refund ? this.refundFromRow(refund) : undefined
  }

  async createOrder(input: CreateOrderInput, scope: FamilyScope = { userId: 'user_demo' }) {
    const selectedPackage = Object.values(servicePackages).find(
      (item) => item.key === input.servicePackage,
    )
    if (!selectedPackage) {
      throw new Error('invalid_service_package')
    }

    const timestamp = now()
    const order = {
      id: createId('ord'),
      orderNo: await this.createOrderNo(),
      userId: scope.userId,
      estimatedPrice: selectedPackage.priceFrom,
      status: orderStatuses.pendingConfirmation,
    }

    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO orders (
            id, order_no, user_id, hospital_name, department_name, visit_date, visit_time,
            service_package, estimated_price, contact_name, contact_phone, elder_relation,
            special_notes, status, assigned_escort_id, customer_service_note, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          order.id,
          order.orderNo,
          order.userId,
          input.hospitalName,
          input.departmentName ?? null,
          input.visitDate,
          input.visitTime,
          input.servicePackage,
          order.estimatedPrice,
          input.contactName,
          input.contactPhone,
          input.elderRelation,
          input.specialNotes ?? null,
          order.status,
          null,
          null,
          timestamp,
          timestamp,
        )

      this.addLogSync({
        orderId: order.id,
        actorType: 'user',
        action: 'order_created',
        toStatus: order.status,
      })
    })

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
    }
  }

  async findOrder(orderId: string) {
    const order = this.findOrderRow(orderId)
    return order ? this.publicOrder(order) : undefined
  }

  async findOrderForUser(orderId: string, userId: string) {
    const order = this.db
      .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
      .get(orderId, userId) as OrderRow | undefined

    return order ? this.publicOrder(order) : undefined
  }

  async listMyOrders(userId = 'user_demo') {
    return this.db
      .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId)
      .map((order) => this.publicOrder(order as OrderRow))
  }

  async listAdminOrders(filters: { status?: OrderStatus; keyword?: string }) {
    const normalizedKeyword = filters.keyword?.trim()
    return this.listOrderRows()
      .filter((order) => {
        const matchesStatus = filters.status ? order.status === filters.status : true
        const matchesKeyword = normalizedKeyword
          ? [
              order.order_no,
              order.contact_name,
              order.contact_phone,
              order.hospital_name,
            ].some((value) => value.includes(normalizedKeyword))
          : true

        return matchesStatus && matchesKeyword
      })
      .map((order) => this.publicOrder(order))
  }

  async getAdminOrder(orderId: string) {
    const order = this.findOrderRow(orderId)
    if (!order) {
      return undefined
    }

    return {
      ...this.publicOrder(order),
      logs: this.db
        .prepare('SELECT * FROM order_logs WHERE order_id = ? ORDER BY created_at DESC')
        .all(order.id)
        .map((log) => this.logFromRow(log as LogRow)),
    }
  }

  async confirmOrder(
    orderId: string,
    input: { customerServiceNote?: string; estimatedPrice?: number },
  ) {
    const order = this.requireOrderRow(orderId)
    if (order.status !== orderStatuses.pendingConfirmation) {
      throw new Error('invalid_status_transition')
    }

    const timestamp = now()
    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE orders
          SET status = ?, customer_service_note = ?, estimated_price = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          orderStatuses.confirmed,
          input.customerServiceNote ?? null,
          input.estimatedPrice ?? order.estimated_price,
          timestamp,
          order.id,
        )
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'order_confirmed',
        fromStatus: order.status as OrderStatus,
        toStatus: orderStatuses.confirmed,
        note: input.customerServiceNote,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async updateAdminOrder(orderId: string, input: UpdateAdminOrderInput) {
    const order = this.requireOrderRow(orderId)
    if (
      order.status === orderStatuses.cancelled ||
      order.status === orderStatuses.unavailable
    ) {
      throw new Error('invalid_status_transition')
    }

    if (input.servicePackage !== undefined) {
      const selectedPackage = Object.values(servicePackages).find(
        (item) => item.key === input.servicePackage,
      )
      if (!selectedPackage) {
        throw new Error('invalid_service_package')
      }
    }
    if (
      input.estimatedPrice !== undefined &&
      (!Number.isFinite(input.estimatedPrice) || input.estimatedPrice < 0)
    ) {
      throw new Error('invalid_estimated_price')
    }

    const timestamp = now()
    const next = {
      hospitalName: requiredText(input.hospitalName, 'hospital_name') ?? order.hospital_name,
      departmentName:
        input.departmentName === undefined
          ? order.department_name
          : input.departmentName.trim() || null,
      visitDate: requiredText(input.visitDate, 'visit_date') ?? order.visit_date,
      visitTime: requiredText(input.visitTime, 'visit_time') ?? order.visit_time,
      servicePackage: input.servicePackage ?? (order.service_package as ServicePackageKey),
      estimatedPrice: input.estimatedPrice ?? order.estimated_price,
      contactName: requiredText(input.contactName, 'contact_name') ?? order.contact_name,
      contactPhone: requiredText(input.contactPhone, 'contact_phone') ?? order.contact_phone,
      elderRelation:
        requiredText(input.elderRelation, 'elder_relation') ?? order.elder_relation,
      specialNotes:
        input.specialNotes === undefined
          ? order.special_notes
          : input.specialNotes.trim() || null,
      customerServiceNote:
        input.customerServiceNote === undefined
          ? order.customer_service_note
          : input.customerServiceNote.trim() || null,
    }

    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE orders
          SET hospital_name = ?, department_name = ?, visit_date = ?, visit_time = ?,
            service_package = ?, estimated_price = ?, contact_name = ?, contact_phone = ?,
            elder_relation = ?, special_notes = ?, customer_service_note = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          next.hospitalName,
          next.departmentName,
          next.visitDate,
          next.visitTime,
          next.servicePackage,
          next.estimatedPrice,
          next.contactName,
          next.contactPhone,
          next.elderRelation,
          next.specialNotes,
          next.customerServiceNote,
          timestamp,
          order.id,
        )
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'order_updated',
        fromStatus: order.status as OrderStatus,
        toStatus: order.status as OrderStatus,
        note: next.customerServiceNote ?? '运营修改订单信息',
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async cancelOrder(orderId: string, reason: string) {
    const order = this.requireOrderRow(orderId)
    if (
      order.status === orderStatuses.completed ||
      order.status === orderStatuses.cancelled ||
      order.status === orderStatuses.unavailable
    ) {
      throw new Error('invalid_status_transition')
    }

    const normalizedReason = requiredText(reason, 'cancel_reason') as string
    const timestamp = now()

    this.transaction(() => {
      if (order.assigned_escort_id) {
        this.db
          .prepare('UPDATE escorts SET status = ? WHERE id = ?')
          .run('available', order.assigned_escort_id)
      }
      this.db
        .prepare(`
          UPDATE orders
          SET status = ?, customer_service_note = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(orderStatuses.cancelled, normalizedReason, timestamp, order.id)
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'order_cancelled',
        fromStatus: order.status as OrderStatus,
        toStatus: orderStatuses.cancelled,
        note: normalizedReason,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async markUnavailable(orderId: string, reason: string) {
    const order = this.requireOrderRow(orderId)
    const timestamp = now()
    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE orders
          SET status = ?, customer_service_note = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(orderStatuses.unavailable, reason, timestamp, order.id)
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'order_unavailable',
        fromStatus: order.status as OrderStatus,
        toStatus: orderStatuses.unavailable,
        note: reason,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async assignOrder(orderId: string, escortId: string) {
    const order = this.requireOrderRow(orderId)
    const escort = this.findEscortRow(escortId)
    if (!escort) {
      throw new Error('escort_not_found')
    }
    if (
      order.status !== orderStatuses.confirmed &&
      order.status !== orderStatuses.assigned
    ) {
      throw new Error('invalid_status_transition')
    }

    const timestamp = now()
    this.transaction(() => {
      this.db.prepare('UPDATE escorts SET status = ? WHERE id = ?').run('busy', escort.id)
      this.db
        .prepare(`
          UPDATE orders
          SET assigned_escort_id = ?, status = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(escort.id, orderStatuses.assigned, timestamp, order.id)
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'order_assigned',
        fromStatus: order.status as OrderStatus,
        toStatus: orderStatuses.assigned,
        note: escort.name,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async createEscort(input: CreateEscortInput) {
    const profile = assertEscortProfile(input)
    const phone = profile.phone
    if (!profile.name || !phone || profile.familiarHospitals.length === 0) {
      throw new Error('invalid_escort_profile')
    }

    const existing = this.db
      .prepare('SELECT id FROM escorts WHERE phone = ? LIMIT 1')
      .get(phone) as { id: string } | undefined
    if (existing) {
      throw new Error('escort_phone_exists')
    }

    const id = createId('esc')
    this.db
      .prepare(`
        INSERT INTO escorts (id, name, phone, familiar_hospitals, status)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        id,
        profile.name,
        phone,
        stringifyArray(profile.familiarHospitals),
        profile.status ?? 'available',
      )

    return this.escortFromRow(this.findEscortRow(id) as EscortRow)
  }

  async updateEscort(escortId: string, input: UpdateEscortInput) {
    const escort = this.findEscortRow(escortId)
    if (!escort) {
      throw new Error('escort_not_found')
    }

    const profile = assertEscortProfile(input)
    const nextPhone = profile.phone ?? escort.phone
    const duplicate = this.db
      .prepare('SELECT id FROM escorts WHERE phone = ? AND id != ? LIMIT 1')
      .get(nextPhone, escort.id) as { id: string } | undefined
    if (duplicate) {
      throw new Error('escort_phone_exists')
    }

    this.db
      .prepare(`
        UPDATE escorts
        SET name = ?, phone = ?, familiar_hospitals = ?, status = ?
        WHERE id = ?
      `)
      .run(
        profile.name ?? escort.name,
        nextPhone,
        input.familiarHospitals === undefined
          ? escort.familiar_hospitals
          : stringifyArray(profile.familiarHospitals),
        profile.status ?? escort.status,
        escort.id,
      )

    return this.escortFromRow(this.findEscortRow(escort.id) as EscortRow)
  }

  async updateEscortStatus(escortId: string, status: EscortStatus) {
    const escort = this.findEscortRow(escortId)
    if (!escort) {
      throw new Error('escort_not_found')
    }

    const nextStatus = assertEscortStatus(status)
    this.db.prepare('UPDATE escorts SET status = ? WHERE id = ?').run(nextStatus, escort.id)
    return this.escortFromRow(this.findEscortRow(escort.id) as EscortRow)
  }

  async listEscorts() {
    return this.db
      .prepare('SELECT * FROM escorts ORDER BY id ASC')
      .all()
      .map((escort) => this.escortFromRow(escort as EscortRow))
  }

  async listEscortTasks(escortId?: string) {
    if (escortId) {
      return this.db
        .prepare(`
          SELECT * FROM orders
          WHERE assigned_escort_id = ?
          ORDER BY created_at DESC
        `)
        .all(escortId)
        .map((order) => this.publicOrder(order as OrderRow))
    }

    return this.db
      .prepare(`
        SELECT * FROM orders
        WHERE assigned_escort_id IS NOT NULL
        ORDER BY created_at DESC
      `)
      .all()
      .map((order) => this.publicOrder(order as OrderRow))
  }

  async updateProgress(
    orderId: string,
    input: { stepKey: ProgressStepKey; note?: string; imageUrls?: string[] },
    scope?: { escortId: string },
  ) {
    const order = this.requireOrderRow(orderId)
    if (scope && order.assigned_escort_id !== scope.escortId) {
      throw new Error('forbidden')
    }

    const step = progressStepList.find((item) => item.key === input.stepKey)
    if (!step) {
      throw new Error('invalid_progress_step')
    }

    const timestamp = now()
    const toStatus =
      input.stepKey === 'service_finished'
        ? orderStatuses.completed
        : orderStatuses.inService

    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO order_progress (
            id, order_id, step_key, step_label, status, note, image_urls, created_by, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          createId('prg'),
          order.id,
          input.stepKey,
          step.label,
          'completed',
          input.note ?? null,
          stringifyArray(input.imageUrls ?? []),
          order.assigned_escort_id ?? 'escort_demo',
          timestamp,
        )

      if (input.stepKey === 'service_finished') {
        const existingSummary = this.db
          .prepare('SELECT id FROM service_summaries WHERE order_id = ?')
          .get(order.id)

        if (!existingSummary) {
          this.db
            .prepare(`
              INSERT INTO service_summaries (
                id, order_id, actual_duration_minutes, visit_result, follow_up_advice,
                overtime_minutes, operator_note, created_by, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              createId('sum'),
              order.id,
              order.service_package === servicePackages.fullDay.key ? 480 : 240,
              '已按预约完成陪诊，陪同完成就诊、缴费及取药相关流程。',
              '建议家属按医生要求复查，如有新增检查请提前联系客服电话。',
              0,
              '演示总结：后续可改为陪诊员手动填写并由运营审核。',
              order.assigned_escort_id ?? 'escort_demo',
              timestamp,
              timestamp,
            )
        }

        if (order.assigned_escort_id) {
          this.db
            .prepare('UPDATE escorts SET status = ? WHERE id = ?')
            .run('available', order.assigned_escort_id)
        }
      }

      this.db
        .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
        .run(toStatus, timestamp, order.id)

      this.addLogSync({
        orderId: order.id,
        actorType: 'escort',
        action: 'progress_updated',
        fromStatus: order.status as OrderStatus,
        toStatus,
        note: step.label,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async createException(
    orderId: string,
    input: { exceptionType: string; description: string },
    scope?: { escortId: string },
  ) {
    const order = this.requireOrderRow(orderId)
    if (scope && order.assigned_escort_id !== scope.escortId) {
      throw new Error('forbidden')
    }

    const timestamp = now()

    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO order_exceptions (
            id, order_id, exception_type, description, handled, resolution, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          createId('exc'),
          order.id,
          input.exceptionType,
          input.description,
          0,
          null,
          timestamp,
          timestamp,
        )
      this.db
        .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
        .run(orderStatuses.exceptionHandling, timestamp, order.id)
      this.addLogSync({
        orderId: order.id,
        actorType: 'escort',
        action: 'exception_created',
        fromStatus: order.status as OrderStatus,
        toStatus: orderStatuses.exceptionHandling,
        note: input.description,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async resolveException(
    orderId: string,
    input: { resolution: 'resume' | 'cancel'; note?: string },
  ) {
    const order = this.requireOrderRow(orderId)
    if (order.status !== orderStatuses.exceptionHandling) {
      throw new Error('order_not_in_exception')
    }

    const timestamp = now()
    const toStatus =
      input.resolution === 'cancel' ? orderStatuses.cancelled : orderStatuses.inService

    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE order_exceptions
          SET handled = 1, resolution = ?, updated_at = ?
          WHERE order_id = ? AND handled = 0
        `)
        .run(input.note ?? input.resolution, timestamp, order.id)
      this.db
        .prepare(`
          UPDATE orders
          SET status = ?, customer_service_note = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(toStatus, input.note ?? null, timestamp, order.id)
      this.addLogSync({
        orderId: order.id,
        actorType: 'admin',
        action: 'exception_resolved',
        fromStatus: order.status as OrderStatus,
        toStatus,
        note: input.note,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  async upsertServiceSummary(
    orderId: string,
    input: UpsertServiceSummaryInput,
    scope?: ServiceSummaryScope,
  ) {
    const order = this.requireOrderRow(orderId)
    if (scope?.escortId && order.assigned_escort_id !== scope.escortId) {
      throw new Error('forbidden')
    }
    if (
      order.status === orderStatuses.cancelled ||
      order.status === orderStatuses.unavailable
    ) {
      throw new Error('invalid_status_transition')
    }

    const actualDurationMinutes = Number(input.actualDurationMinutes)
    if (!Number.isFinite(actualDurationMinutes) || actualDurationMinutes <= 0) {
      throw new Error('invalid_actual_duration_minutes')
    }

    const overtimeMinutes = Number(input.overtimeMinutes ?? 0)
    if (!Number.isFinite(overtimeMinutes) || overtimeMinutes < 0) {
      throw new Error('invalid_overtime_minutes')
    }

    const visitResult = requiredText(input.visitResult, 'visit_result') as string
    const followUpAdvice = requiredText(input.followUpAdvice, 'follow_up_advice') as string
    const operatorNote = requiredText(input.operatorNote, 'operator_note') as string
    const timestamp = now()
    const createdBy = scope?.createdBy ?? scope?.escortId ?? 'admin'
    const actorType = scope?.actorType ?? (scope?.escortId ? 'escort' : 'admin')
    const serviceFinishedStep = progressStepList.find((item) => item.key === 'service_finished')

    this.transaction(() => {
      const existingSummary = this.db
        .prepare('SELECT id FROM service_summaries WHERE order_id = ?')
        .get(order.id) as { id: string } | undefined

      if (existingSummary) {
        this.db
          .prepare(`
            UPDATE service_summaries
            SET actual_duration_minutes = ?, visit_result = ?, follow_up_advice = ?,
              overtime_minutes = ?, operator_note = ?, updated_at = ?
            WHERE order_id = ?
          `)
          .run(
            actualDurationMinutes,
            visitResult,
            followUpAdvice,
            overtimeMinutes,
            operatorNote,
            timestamp,
            order.id,
          )
      } else {
        this.db
          .prepare(`
            INSERT INTO service_summaries (
              id, order_id, actual_duration_minutes, visit_result, follow_up_advice,
              overtime_minutes, operator_note, created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            createId('sum'),
            order.id,
            actualDurationMinutes,
            visitResult,
            followUpAdvice,
            overtimeMinutes,
            operatorNote,
            createdBy,
            timestamp,
            timestamp,
          )
      }

      const existingFinishProgress = this.db
        .prepare('SELECT id FROM order_progress WHERE order_id = ? AND step_key = ? LIMIT 1')
        .get(order.id, 'service_finished')

      if (!existingFinishProgress) {
        this.db
          .prepare(`
            INSERT INTO order_progress (
              id, order_id, step_key, step_label, status, note, image_urls, created_by, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            createId('prg'),
            order.id,
            'service_finished',
            serviceFinishedStep?.label ?? '服务结束',
            'completed',
            '服务总结已提交',
            stringifyArray([]),
            createdBy,
            timestamp,
          )
      }

      if (order.assigned_escort_id) {
        this.db
          .prepare('UPDATE escorts SET status = ? WHERE id = ?')
          .run('available', order.assigned_escort_id)
      }

      this.db
        .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
        .run(orderStatuses.completed, timestamp, order.id)

      this.addLogSync({
        orderId: order.id,
        actorType,
        action: existingSummary ? 'service_summary_updated' : 'service_summary_created',
        fromStatus: order.status as OrderStatus,
        toStatus: orderStatuses.completed,
        note: visitResult,
      })
    })

    return this.publicOrder(this.requireOrderRow(order.id))
  }

  private createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS escorts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        familiar_hospitals TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        open_id TEXT NOT NULL UNIQUE,
        nickname TEXT,
        phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escort_openid_bindings (
        open_id TEXT PRIMARY KEY,
        escort_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escort_phone_whitelist (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        escort_id TEXT,
        access_code TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_no TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        hospital_name TEXT NOT NULL,
        department_name TEXT,
        visit_date TEXT NOT NULL,
        visit_time TEXT NOT NULL,
        service_package TEXT NOT NULL,
        estimated_price INTEGER NOT NULL,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        elder_relation TEXT NOT NULL,
        special_notes TEXT,
        status TEXT NOT NULL,
        assigned_escort_id TEXT,
        customer_service_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_progress (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        step_key TEXT NOT NULL,
        step_label TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        image_urls TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_logs (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        out_trade_no TEXT NOT NULL UNIQUE,
        prepay_id TEXT,
        transaction_id TEXT,
        payer_open_id TEXT NOT NULL,
        amount_fen INTEGER NOT NULL,
        paid_amount_fen INTEGER,
        status TEXT NOT NULL,
        paid_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        out_refund_no TEXT NOT NULL UNIQUE,
        refund_id TEXT,
        amount_fen INTEGER NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        success_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_exceptions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        exception_type TEXT NOT NULL,
        description TEXT NOT NULL,
        handled INTEGER NOT NULL,
        resolution TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS service_summaries (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE,
        actual_duration_minutes INTEGER NOT NULL,
        visit_result TEXT NOT NULL,
        follow_up_advice TEXT NOT NULL,
        overtime_minutes INTEGER NOT NULL,
        operator_note TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_logs (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        event TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        template_id TEXT,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_order_progress_order_id ON order_progress(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_logs_order_id ON order_logs(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_exceptions_order_id ON order_exceptions(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_out_refund_no ON refunds(out_refund_no);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON notification_logs(order_id);
      CREATE INDEX IF NOT EXISTS idx_escort_phone_whitelist_phone ON escort_phone_whitelist(phone);
    `)

    const whitelistColumns = this.db
      .prepare('PRAGMA table_info(escort_phone_whitelist)')
      .all() as Array<{ name: string }>
    if (!whitelistColumns.some((column) => column.name === 'access_code')) {
      this.db.exec('ALTER TABLE escort_phone_whitelist ADD COLUMN access_code TEXT')
    }
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_escort_access_code ON escort_phone_whitelist(access_code)')
  }

  private transaction(callback: () => void) {
    this.db.exec('BEGIN')
    try {
      callback()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private async createOrderNo() {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM orders').get() as {
      count: number
    }

    return `LZ${year}${month}${day}${String(row.count + 1).padStart(4, '0')}`
  }

  private listOrderRows() {
    return this.db
      .prepare('SELECT * FROM orders ORDER BY created_at DESC')
      .all() as OrderRow[]
  }

  private findOrderRow(orderId: string) {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      | OrderRow
      | undefined
  }

  private requireOrderRow(orderId: string) {
    const order = this.findOrderRow(orderId)
    if (!order) {
      throw new Error('order_not_found')
    }
    return order
  }

  private findEscortRow(escortId: string) {
    return this.db.prepare('SELECT * FROM escorts WHERE id = ?').get(escortId) as
      | EscortRow
      | undefined
  }

  private paymentCount() {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM payments').get() as {
      count: number
    }
    return row.count
  }

  private requirePaymentByOutTradeNo(outTradeNo: string) {
    const payment = this.db
      .prepare('SELECT * FROM payments WHERE out_trade_no = ?')
      .get(outTradeNo) as PaymentRow | undefined

    if (!payment) {
      throw new Error('payment_not_found')
    }

    return payment
  }

  private requireRefundByOutRefundNo(outRefundNo: string) {
    const refund = this.db
      .prepare('SELECT * FROM refunds WHERE out_refund_no = ?')
      .get(outRefundNo) as RefundRow | undefined

    if (!refund) {
      throw new Error('refund_not_found')
    }

    return refund
  }

  private addLogSync(entry: {
    orderId: string
    actorType: 'user' | 'admin' | 'escort' | 'system'
    action: string
    fromStatus?: OrderStatus
    toStatus?: OrderStatus
    note?: string
  }) {
    this.db
      .prepare(`
        INSERT INTO order_logs (
          id, order_id, actor_type, action, from_status, to_status, note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        createId('log'),
        entry.orderId,
        entry.actorType,
        entry.action,
        entry.fromStatus ?? null,
        entry.toStatus ?? null,
        entry.note ?? null,
        now(),
      )
  }

  private publicOrder(order: OrderRow) {
    const escort = order.assigned_escort_id
      ? this.findEscortRow(order.assigned_escort_id)
      : undefined
    const progress = this.db
      .prepare('SELECT * FROM order_progress WHERE order_id = ? ORDER BY created_at ASC')
      .all(order.id) as ProgressRow[]
    const exceptions = this.db
      .prepare('SELECT * FROM order_exceptions WHERE order_id = ? ORDER BY created_at DESC')
      .all(order.id) as ExceptionRow[]
    const serviceSummary = this.db
      .prepare('SELECT * FROM service_summaries WHERE order_id = ?')
      .get(order.id) as SummaryRow | undefined
    const payment = this.db
      .prepare(`
        SELECT * FROM payments
        WHERE order_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(order.id) as PaymentRow | undefined
    const refunds = this.db
      .prepare(`
        SELECT * FROM refunds
        WHERE order_id = ?
        ORDER BY created_at DESC
      `)
      .all(order.id) as RefundRow[]
    const refundItems = refunds.map((item) => this.refundFromRow(item))

    return {
      id: order.id,
      orderNo: order.order_no,
      userId: order.user_id,
      hospitalName: order.hospital_name,
      departmentName: order.department_name ?? undefined,
      visitDate: order.visit_date,
      visitTime: order.visit_time,
      servicePackage: order.service_package as ServicePackageKey,
      estimatedPrice: order.estimated_price,
      contactName: order.contact_name,
      contactPhone: order.contact_phone,
      elderRelation: order.elder_relation,
      specialNotes: order.special_notes ?? undefined,
      status: order.status as OrderStatus,
      assignedEscortId: order.assigned_escort_id ?? undefined,
      customerServiceNote: order.customer_service_note ?? undefined,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      escort: escort ? this.escortFromRow(escort) : undefined,
      progress: progress.map((item) => ({
        id: item.id,
        orderId: item.order_id,
        stepKey: item.step_key as ProgressStepKey,
        stepLabel: item.step_label,
        status: item.status as 'completed' | 'skipped',
        note: item.note ?? undefined,
        imageUrls: parseJsonArray(item.image_urls),
        createdBy: item.created_by,
        createdAt: item.created_at,
      })),
      exceptions: exceptions.map((item) => this.exceptionFromRow(item)),
      payment: payment ? this.paymentFromRow(payment) : undefined,
      refund: refundItems[0],
      refunds: refundItems,
      serviceSummary: serviceSummary
        ? {
            id: serviceSummary.id,
            orderId: serviceSummary.order_id,
            actualDurationMinutes: serviceSummary.actual_duration_minutes,
            visitResult: serviceSummary.visit_result,
            followUpAdvice: serviceSummary.follow_up_advice,
            overtimeMinutes: serviceSummary.overtime_minutes,
            operatorNote: serviceSummary.operator_note,
            createdBy: serviceSummary.created_by,
            createdAt: serviceSummary.created_at,
            updatedAt: serviceSummary.updated_at,
          }
        : undefined,
    }
  }

  private escortFromRow(escort: EscortRow) {
    return {
      id: escort.id,
      name: escort.name,
      phone: escort.phone,
      familiarHospitals: parseJsonArray(escort.familiar_hospitals),
      status: escort.status as EscortStatus,
    }
  }

  private escortPhoneWhitelistFromRow(item: EscortPhoneWhitelistRow) {
    return {
      id: item.id,
      phone: item.phone,
      escortId: item.escort_id ?? undefined,
      accessCode: item.access_code ?? undefined,
      name: item.name,
      status: item.status as 'active' | 'disabled',
      note: item.note ?? undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }

  private exceptionFromRow(item: ExceptionRow) {
    return {
      id: item.id,
      orderId: item.order_id,
      exceptionType: item.exception_type,
      description: item.description,
      handled: Boolean(item.handled),
      resolution: item.resolution ?? undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }

  private logFromRow(item: LogRow) {
    return {
      id: item.id,
      orderId: item.order_id,
      actorType: item.actor_type,
      action: item.action,
      fromStatus: item.from_status ?? undefined,
      toStatus: item.to_status ?? undefined,
      note: item.note ?? undefined,
      createdAt: item.created_at,
    }
  }

  private notificationLogFromRow(item: NotificationLogRow) {
    return {
      id: item.id,
      orderId: item.order_id ?? undefined,
      event: item.event,
      recipientType: item.recipient_type,
      recipientId: item.recipient_id,
      channel: item.channel,
      templateId: item.template_id ?? undefined,
      status: item.status,
      payload: JSON.parse(item.payload),
      errorMessage: item.error_message ?? undefined,
      createdAt: item.created_at,
    }
  }

  private refundFromRow(item: RefundRow) {
    return {
      id: item.id,
      orderId: item.order_id,
      paymentId: item.payment_id,
      channel: item.channel,
      outRefundNo: item.out_refund_no,
      refundId: item.refund_id ?? undefined,
      amountFen: item.amount_fen,
      status: item.status as RefundStatus,
      reason: item.reason ?? undefined,
      successTime: item.success_time ?? undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }

  private paymentFromRow(item: PaymentRow) {
    return {
      id: item.id,
      orderId: item.order_id,
      userId: item.user_id,
      channel: item.channel,
      outTradeNo: item.out_trade_no,
      prepayId: item.prepay_id ?? undefined,
      transactionId: item.transaction_id ?? undefined,
      payerOpenId: item.payer_open_id,
      amountFen: item.amount_fen,
      paidAmountFen: item.paid_amount_fen ?? undefined,
      status: item.status as 'pending' | 'paid' | 'closed' | 'refunded',
      paidAt: item.paid_at ?? undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }
}

export const createSqliteStore = async (options: StoreOptions) => {
  await mkdir(dirname(options.databasePath), { recursive: true })
  const db = new DatabaseSync(options.databasePath)
  const store = new SqliteStore(db)
  if (options.seedDemoData) {
    await store.seedDemoDataIfEmpty()
  }
  return store
}

export type {
  CreateEscortInput,
  CreateEscortPhoneWhitelistInput,
  CreateOrderInput,
  CreatePaymentInput,
  CreateRefundInput,
  EscortBindInput,
  EscortStatus,
  FamilyLoginInput,
  FamilyScope,
  MarkPaymentPaidByOrderInput,
  MarkPaymentPaidInput,
  NotificationLogInput,
  RefundStatus,
  UpdateAdminOrderInput,
  UpdateEscortInput,
  UpdateRefundStatusInput,
}
