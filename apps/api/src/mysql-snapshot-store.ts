import { DatabaseSync } from 'node:sqlite'
import mysql from 'mysql2/promise'
import {
  SqliteStore,
  type CreateEscortInput,
  type CreateEscortPhoneWhitelistInput,
  type CreateOrderInput,
  type CreatePaymentInput,
  type CreateRefundInput,
  type EscortStatus,
  type EscortBindInput,
  type FamilyLoginInput,
  type FamilyScope,
  type MarkPaymentPaidByOrderInput,
  type MarkPaymentPaidInput,
  type NotificationLogInput,
  type UpdateAdminOrderInput,
  type UpdateEscortInput,
  type UpdateRefundStatusInput,
} from './sqlite-store.js'
import type { ProgressStepKey } from '@yinian-zhipei/shared'

type MysqlSnapshotOptions = {
  address: string
  username: string
  password: string
  database?: string
  snapshotId?: string
  seedDemoData?: boolean
}

type SerializableDatabaseSync = DatabaseSync & {
  serialize(): Uint8Array
  deserialize(data: Uint8Array): void
}

const DEFAULT_DATABASE = 'yinian_zhipei'
const DEFAULT_SNAPSHOT_ID = 'primary'

export const parseMysqlAddress = (address: string) => {
  const [host, portText] = address.split(':')
  return {
    host,
    port: portText ? Number(portText) : 3306,
  }
}

const quoteIdentifier = (value: string) => `\`${value.replaceAll('`', '``')}\``

class MysqlSnapshotStore extends SqliteStore {
  private persistQueue = Promise.resolve()

  constructor(
    private readonly snapshotDb: DatabaseSync,
    private readonly pool: mysql.Pool,
    private readonly snapshotId = DEFAULT_SNAPSHOT_ID,
  ) {
    super(snapshotDb)
  }

  private async persistSnapshot() {
    const snapshot = Buffer.from((this.snapshotDb as SerializableDatabaseSync).serialize())
    this.persistQueue = this.persistQueue.then(async () => {
      await this.pool.execute(
        `
          INSERT INTO app_snapshots (id, data, updated_at)
          VALUES (?, ?, NOW(3))
          ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)
        `,
        [this.snapshotId, snapshot],
      )
    })
    return this.persistQueue
  }

  async close() {
    await this.persistQueue
    await super.close()
    await this.pool.end()
  }

  async resetDemoData() {
    const result = await super.resetDemoData()
    await this.persistSnapshot()
    return result
  }

  async cleanupDemoData() {
    const result = await super.cleanupDemoData()
    await this.persistSnapshot()
    return result
  }

  async seedDemoDataIfEmpty() {
    const result = await super.seedDemoDataIfEmpty()
    await this.persistSnapshot()
    return result
  }

  async upsertFamilyUserByOpenId(input: FamilyLoginInput) {
    const result = await super.upsertFamilyUserByOpenId(input)
    await this.persistSnapshot()
    return result
  }

  async createEscortAccessCode(input: CreateEscortPhoneWhitelistInput) {
    const result = await super.createEscortAccessCode(input)
    await this.persistSnapshot()
    return result
  }

  async createEscort(input: CreateEscortInput) {
    const result = await super.createEscort(input)
    await this.persistSnapshot()
    return result
  }

  async updateEscort(escortId: string, input: UpdateEscortInput) {
    const result = await super.updateEscort(escortId, input)
    await this.persistSnapshot()
    return result
  }

  async updateEscortStatus(escortId: string, status: EscortStatus) {
    const result = await super.updateEscortStatus(escortId, status)
    await this.persistSnapshot()
    return result
  }

  async updateEscortAccessCodeStatus(id: string, status: 'active' | 'disabled') {
    const result = await super.updateEscortAccessCodeStatus(id, status)
    await this.persistSnapshot()
    return result
  }

  async bindEscortOpenId(input: EscortBindInput) {
    const result = await super.bindEscortOpenId(input)
    await this.persistSnapshot()
    return result
  }

  async createNotificationLog(input: NotificationLogInput) {
    const result = await super.createNotificationLog(input)
    await this.persistSnapshot()
    return result
  }

  async createWechatPayment(input: CreatePaymentInput) {
    const result = await super.createWechatPayment(input)
    await this.persistSnapshot()
    return result
  }

  async attachWechatPrepayId(outTradeNo: string, prepayId: string) {
    const result = await super.attachWechatPrepayId(outTradeNo, prepayId)
    await this.persistSnapshot()
    return result
  }

  async markWechatPaymentPaid(input: MarkPaymentPaidInput) {
    const result = await super.markWechatPaymentPaid(input)
    await this.persistSnapshot()
    return result
  }

  async markWechatPaymentPaidByOrderId(input: MarkPaymentPaidByOrderInput) {
    const result = await super.markWechatPaymentPaidByOrderId(input)
    await this.persistSnapshot()
    return result
  }

  async createWechatRefund(input: CreateRefundInput) {
    const result = await super.createWechatRefund(input)
    await this.persistSnapshot()
    return result
  }

  async updateWechatRefundStatus(outRefundNo: string, input: UpdateRefundStatusInput) {
    const result = await super.updateWechatRefundStatus(outRefundNo, input)
    await this.persistSnapshot()
    return result
  }

  async createOrder(input: CreateOrderInput, scope: FamilyScope = { userId: 'user_demo' }) {
    const result = await super.createOrder(input, scope)
    await this.persistSnapshot()
    return result
  }

  async confirmOrder(
    orderId: string,
    input: { customerServiceNote?: string; estimatedPrice?: number },
  ) {
    const result = await super.confirmOrder(orderId, input)
    await this.persistSnapshot()
    return result
  }

  async updateAdminOrder(orderId: string, input: UpdateAdminOrderInput) {
    const result = await super.updateAdminOrder(orderId, input)
    await this.persistSnapshot()
    return result
  }

  async cancelOrder(orderId: string, reason: string) {
    const result = await super.cancelOrder(orderId, reason)
    await this.persistSnapshot()
    return result
  }

  async markUnavailable(orderId: string, reason: string) {
    const result = await super.markUnavailable(orderId, reason)
    await this.persistSnapshot()
    return result
  }

  async assignOrder(orderId: string, escortId: string) {
    const result = await super.assignOrder(orderId, escortId)
    await this.persistSnapshot()
    return result
  }

  async updateProgress(
    orderId: string,
    input: { stepKey: ProgressStepKey; note?: string; imageUrls?: string[] },
    scope?: { escortId: string },
  ) {
    const result = await super.updateProgress(orderId, input, scope)
    await this.persistSnapshot()
    return result
  }

  async createException(
    orderId: string,
    input: { exceptionType: string; description: string },
    scope?: { escortId: string },
  ) {
    const result = await super.createException(orderId, input, scope)
    await this.persistSnapshot()
    return result
  }

  async resolveException(
    orderId: string,
    input: { resolution: 'resume' | 'cancel'; note?: string },
  ) {
    const result = await super.resolveException(orderId, input)
    await this.persistSnapshot()
    return result
  }

  async upsertServiceSummary(
    orderId: string,
    input: {
      actualDurationMinutes: number
      visitResult: string
      followUpAdvice: string
      overtimeMinutes?: number
      operatorNote: string
    },
    scope?: { escortId?: string; actorType?: 'admin' | 'escort'; createdBy?: string },
  ) {
    const result = await super.upsertServiceSummary(orderId, input, scope)
    await this.persistSnapshot()
    return result
  }
}

export const createMysqlSnapshotStore = async (options: MysqlSnapshotOptions) => {
  const { host, port } = parseMysqlAddress(options.address)
  const database = options.database || DEFAULT_DATABASE
  const snapshotId = options.snapshotId || DEFAULT_SNAPSHOT_ID
  const bootstrapConnection = await mysql.createConnection({
    host,
    port,
    user: options.username,
    password: options.password,
    multipleStatements: false,
  })

  await bootstrapConnection.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await bootstrapConnection.end()

  const pool = mysql.createPool({
    host,
    port,
    user: options.username,
    password: options.password,
    database,
    waitForConnections: true,
    connectionLimit: 4,
    namedPlaceholders: false,
  })

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_snapshots (
      id VARCHAR(64) PRIMARY KEY,
      data LONGBLOB NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT data FROM app_snapshots WHERE id = ? LIMIT 1',
    [snapshotId],
  )

  const snapshotDb = new DatabaseSync(':memory:')
  const snapshot = rows[0]?.data
  if (snapshot) {
    ;(snapshotDb as SerializableDatabaseSync).deserialize(
      Buffer.isBuffer(snapshot) ? snapshot : Buffer.from(snapshot),
    )
  }

  const store = new MysqlSnapshotStore(snapshotDb, pool, snapshotId)
  if (options.seedDemoData) {
    await store.seedDemoDataIfEmpty()
  }
  return store
}
