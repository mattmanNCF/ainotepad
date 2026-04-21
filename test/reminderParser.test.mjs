import test from 'node:test'
import assert from 'node:assert/strict'
import { DateTime } from 'luxon'

// Import the compiled parser. We run against the TypeScript source via tsx.
// Package.json adds `"test:reminder": "tsx --test test/reminderParser.test.mjs"`
// tsx resolves .ts imports transparently.

const { parseReminderDate } = await import('../src/main/calendar/reminderParser.ts')

// Fixed reference date so chrono's "tomorrow" is deterministic across runs.
// 2026-06-15 12:00:00 UTC — Monday, no DST transition nearby for most zones.
const REF = new Date('2026-06-15T12:00:00.000Z')

test('UTC: explicit ISO datetime round-trips', () => {
  const result = parseReminderDate('2026-06-20 10:30', 'UTC', REF)
  assert.ok(result, 'should parse')
  assert.equal(result.original_tz, 'UTC')
  // 10:30 UTC on 2026-06-20 = epoch 2026-06-20T10:30:00Z
  const back = DateTime.fromISO(result.timestamp_utc, { zone: 'utc' })
  assert.equal(back.toFormat('yyyy-MM-dd HH:mm'), '2026-06-20 10:30')
})

test('America/Los_Angeles: local 3pm PDT converts to 22:00 UTC', () => {
  const result = parseReminderDate('2026-06-20 15:00', 'America/Los_Angeles', REF)
  assert.ok(result, 'should parse')
  assert.equal(result.original_tz, 'America/Los_Angeles')
  // June = PDT = UTC-7; 15:00 local = 22:00 UTC
  const back = DateTime.fromISO(result.timestamp_utc, { zone: 'America/Los_Angeles' })
  assert.equal(back.toFormat('yyyy-MM-dd HH:mm'), '2026-06-20 15:00')
})

test('Asia/Kolkata: UTC+5:30 no DST', () => {
  const result = parseReminderDate('2026-06-20 10:30', 'Asia/Kolkata', REF)
  assert.ok(result, 'should parse')
  assert.equal(result.original_tz, 'Asia/Kolkata')
  const back = DateTime.fromISO(result.timestamp_utc, { zone: 'Asia/Kolkata' })
  assert.equal(back.toFormat('yyyy-MM-dd HH:mm'), '2026-06-20 10:30')
})

test('Pacific/Chatham: UTC+12:45 unusual offset — luxon handles, chrono alone would fail', () => {
  const result = parseReminderDate('2026-06-20 09:15', 'Pacific/Chatham', REF)
  assert.ok(result, 'should parse')
  assert.equal(result.original_tz, 'Pacific/Chatham')
  // Pacific/Chatham in June = CHAST = UTC+12:45; 09:15 local = 20:30 prior day UTC
  const back = DateTime.fromISO(result.timestamp_utc, { zone: 'Pacific/Chatham' })
  assert.equal(back.toFormat('yyyy-MM-dd HH:mm'), '2026-06-20 09:15')
  assert.ok(back.isValid, 'luxon should consider the converted moment valid')
})

test('DST crossover: America/Los_Angeles on 2026-11-01 (end of DST) at 09:00 local', () => {
  // Reference date one day before; parse "2026-11-01 09:00" relative to Oct 31
  const beforeDst = new Date('2026-10-31T12:00:00.000Z')
  const result = parseReminderDate('2026-11-01 09:00', 'America/Los_Angeles', beforeDst)
  assert.ok(result, 'should parse')
  // Nov 1 2026 = PST (UTC-8) because DST ended at 02:00 local that morning
  const back = DateTime.fromISO(result.timestamp_utc, { zone: 'America/Los_Angeles' })
  assert.equal(back.toFormat('yyyy-MM-dd HH:mm ZZZZ'), '2026-11-01 09:00 PST')
})

test('Gibberish returns null', () => {
  const result = parseReminderDate('asdfghjkl', 'UTC', REF)
  assert.equal(result, null)
})

test('Invalid zone returns null', () => {
  const result = parseReminderDate('2026-06-20 10:30', 'Not/A_Real_Zone_Blah', REF)
  assert.equal(result, null)
})

test('Relative "tomorrow at 9am" in LA resolves to next day 09:00 local', () => {
  // REF is 2026-06-15T12:00:00Z — Monday 05:00 PDT
  const result = parseReminderDate('tomorrow at 9am', 'America/Los_Angeles', REF)
  assert.ok(result, 'should parse')
  const back = DateTime.fromISO(result.timestamp_utc, { zone: 'America/Los_Angeles' })
  assert.equal(back.toFormat('yyyy-MM-dd HH:mm'), '2026-06-16 09:00')
})
