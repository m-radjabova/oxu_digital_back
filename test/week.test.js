const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  addDays,
  getWeekDates,
  getWeekStart,
  getTodayDateKey,
  isDateInWeek,
  parseDateKey,
  toDateKey,
} = require('../utils/week')

test('week start resolves any day of the week to its monday', () => {
  assert.equal(getWeekStart('2026-11-09'), '2026-11-09')
  assert.equal(getWeekStart('2026-11-12'), '2026-11-09')
  assert.equal(getWeekStart('2026-11-15'), '2026-11-09')
  assert.equal(getWeekStart('2026-11-16'), '2026-11-16')
})

test('week helpers reject malformed calendar dates', () => {
  assert.equal(parseDateKey('2026-13-01'), null)
  assert.equal(parseDateKey('2026-02-30'), null)
  assert.equal(parseDateKey('12-11-2026'), null)
  assert.equal(getWeekStart('noyabr'), null)
  assert.equal(toDateKey('2026-02-30'), null)
  assert.equal(isDateInWeek('2026-11-16', '2026-11-09'), false)
})

test('week dates and day offsets stay inside the selected week', () => {
  assert.equal(addDays('2026-11-09', 5), '2026-11-14')
  assert.deepEqual(getWeekDates('2026-11-12'), [
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
    '2026-11-15',
  ])
  assert.equal(isDateInWeek('2026-11-14', '2026-11-09'), true)
  assert.equal(isDateInWeek('2026-11-15', '2026-11-09'), true)
  assert.equal(isDateInWeek('2026-11-15', '2026-11-16'), false)
})

test('week start accepts a local date object', () => {
  const thursday = new Date(2026, 10, 12, 15, 20)

  assert.equal(toDateKey(thursday), '2026-11-12')
  assert.equal(getWeekStart(thursday), '2026-11-09')
})

test('today date key uses the Uzbekistan calendar day regardless of server timezone', () => {
  assert.equal(getTodayDateKey(new Date('2026-11-12T18:59:00.000Z')), '2026-11-12')
  assert.equal(getTodayDateKey(new Date('2026-11-12T19:00:00.000Z')), '2026-11-13')
})
