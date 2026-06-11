import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { parseMysqlAddress } from './mysql-snapshot-store.js'

test('parses MySQL host and port', () => {
  assert.deepEqual(parseMysqlAddress('10.28.101.29:3306'), {
    host: '10.28.101.29',
    port: 3306,
  })
  assert.deepEqual(parseMysqlAddress('localhost'), {
    host: 'localhost',
    port: 3306,
  })
})

test('serializes and restores a SQLite snapshot', () => {
  const first = new DatabaseSync(':memory:')
  first.exec('CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT NOT NULL)')
  first.prepare('INSERT INTO items (id, value) VALUES (?, ?)').run('item_1', 'persisted')

  const snapshot = (first as DatabaseSync & { serialize(): Uint8Array }).serialize()
  first.close()

  const second = new DatabaseSync(':memory:')
  ;(second as DatabaseSync & { deserialize(data: Uint8Array): void }).deserialize(snapshot)
  const row = second.prepare('SELECT value FROM items WHERE id = ?').get('item_1') as {
    value: string
  }
  second.close()

  assert.equal(row.value, 'persisted')
})
