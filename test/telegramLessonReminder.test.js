const test = require('node:test')
const assert = require('node:assert/strict')
const Lesson = require('../models/Lesson')
const { getTelegramStatus } = require('../controllers/telegramController')
const { PERIOD_TIMES } = require('../services/telegramNotification')
const { createLessonReminderRunner, getReminderWindow, startLessonReminders } = require('../services/telegramLessonReminder')

const REMINDER_TIME = new Date('2026-11-17T04:50:00.000Z')

function makeFixture(overrides = {}) {
  const record = {
    _id: 'lesson-1',
    teacher: { name: 'Ali', role: 'teacher', isActive: true, telegramId: '123' },
    subject: { name: 'Matematika' },
    groups: [{ name: 'DEMO-G10' }],
    room: 'Old room name',
    roomId: { number: '703', building: { name: '4-bino' } },
    weekStart: '2026-11-16',
    dayOfWeek: 2,
    period: 2,
    ...overrides,
  }
  const calls = { find: [], claim: [], update: [], send: [], errors: [] }
  let failFind = false
  function matchesSlot(filter) {
    return record.weekStart === filter.weekStart && record.dayOfWeek === filter.dayOfWeek
      && filter.period.$in.includes(record.period) && !record.telegramReminderSentAt
  }
  function populatedQuery(value) {
    return {
      populate(options) {
        if (value && options.path === 'teacher') {
          assert.equal(options.match.role, 'teacher')
          assert.equal(options.match.isActive, true)
          const teacher = value.teacher
          if (!teacher || teacher.role !== 'teacher' || !teacher.isActive || !teacher.telegramId) value.teacher = null
        }
        return this
      },
      then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
    }
  }
  const LessonModel = {
    find(filter) {
      calls.find.push(filter)
      if (failFind) throw new Error('Database offline')
      return { select: () => ({ lean: async () => matchesSlot(filter) ? [{ _id: record._id }] : [] }) }
    },
    findOneAndUpdate(filter, update, options) {
      calls.claim.push({ filter, update, options })
      assert.equal(options.timestamps, false)
      const expiresBefore = filter.$or[1].telegramReminderClaimedAt.$lte
      if (!matchesSlot(filter) || (record.telegramReminderClaimedAt && record.telegramReminderClaimedAt > expiresBefore)) {
        return populatedQuery(null)
      }
      Object.assign(record, update.$set)
      return populatedQuery(structuredClone(record))
    },
    async updateOne(filter, update, options) {
      calls.update.push({ filter, update, options })
      assert.equal(options.timestamps, false)
      if (record.telegramReminderClaimToken !== filter.telegramReminderClaimToken) return { modifiedCount: 0 }
      Object.assign(record, update.$set || {})
      for (const key of Object.keys(update.$unset || {})) delete record[key]
      return { modifiedCount: 1 }
    },
  }
  const options = {
    LessonModel,
    clock: () => REMINDER_TIME,
    isBotReady: () => true,
    sendReminder: async (payload) => { calls.send.push(payload); return true },
    logger: { error: (...args) => calls.errors.push(args) },
  }
  return { record, calls, options, setFailFind: (value) => { failFind = value } }
}

test('uses Tashkent time and correct week/day with precise ten-minute boundaries', () => {
  assert.equal(getReminderWindow(new Date('2026-11-17T04:49:59.999Z')), null)
  const window = getReminderWindow(REMINDER_TIME)
  assert.equal(window.dateKey, '2026-11-17')
  assert.equal(window.weekStart, '2026-11-16')
  assert.equal(window.dayOfWeek, 2)
  assert.deepEqual([...window.minutesByPeriod], [[2, 10]])
  assert.equal(getReminderWindow(new Date('2026-11-17T04:50:15Z')).minutesByPeriod.get(2), 10)
  assert.equal(getReminderWindow(new Date('2026-11-17T04:51:00Z')).minutesByPeriod.get(2), 9)
  assert.equal(getReminderWindow(new Date('2026-11-17T04:59:59.999Z')).minutesByPeriod.get(2), 1)
  assert.equal(getReminderWindow(new Date('2026-11-17T05:00:00Z')), null)
  assert.equal(getReminderWindow(new Date('2026-11-22T04:50:00Z')), null)
  assert.equal(getReminderWindow(new Date('invalid')), null)
})

test('all eight periods have a ten-minute reminder window', () => {
  for (const [number, range] of Object.entries(PERIOD_TIMES)) {
    const start = new Date(`2026-11-17T${range.slice(0, 5)}:00+05:00`)
    const now = new Date(start.getTime() - 10 * 60_000)
    assert.deepEqual([...getReminderWindow(now).minutesByPeriod], [[Number(number), 10]])
  }
  assert.equal(getReminderWindow(new Date('2027-01-04T03:20:00Z')).weekStart, '2027-01-04')
})

test('sends once and persists delivery across ticks and worker restarts', async () => {
  const fixture = makeFixture()
  const run = createLessonReminderRunner(fixture.options)
  assert.equal(await run(), 1)
  assert.equal(await run(), 0)
  assert.equal(await createLessonReminderRunner(fixture.options)(), 0)
  assert.equal(fixture.calls.send.length, 1)
  assert.equal(fixture.record.telegramReminderSentAt, REMINDER_TIME)
  assert.equal(fixture.record.telegramReminderClaimToken, undefined)
  assert.equal(fixture.calls.send[0].minutesBefore, 10)
  assert.equal(fixture.calls.send[0].lesson.room, '4-bino 703-xona')
  assert.ok(fixture.calls.send[0].signal instanceof AbortSignal)
  assert.deepEqual(fixture.calls.find[0], {
    weekStart: '2026-11-16', dayOfWeek: 2, period: { $in: [2] }, telegramReminderSentAt: null,
  })
})

test('concurrent backend instances cannot claim the same lesson', async () => {
  const fixture = makeFixture()
  const results = await Promise.all([
    createLessonReminderRunner(fixture.options)(),
    createLessonReminderRunner(fixture.options)(),
  ])
  assert.equal(results.reduce((sum, count) => sum + count, 0), 1)
  assert.equal(fixture.calls.send.length, 1)
})

test('an overlapping tick does not start another scan', async () => {
  const fixture = makeFixture()
  let finishSend
  const run = createLessonReminderRunner({ ...fixture.options, sendReminder: () => new Promise((resolve) => { finishSend = resolve }) })
  const pending = run()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(await run(), 0)
  finishSend(true)
  assert.equal(await pending, 1)
  assert.equal(fixture.calls.find.length, 1)
})

test('failed and thrown deliveries release the claim so the next tick can retry', async () => {
  for (const throws of [false, true]) {
    const fixture = makeFixture()
    let attempts = 0
    const run = createLessonReminderRunner({ ...fixture.options, sendReminder: async () => {
      attempts += 1
      if (attempts === 1) {
        if (throws) throw new Error('Telegram offline')
        return false
      }
      return true
    } })
    assert.equal(await run(), 0)
    assert.equal(fixture.record.telegramReminderSentAt, undefined)
    assert.equal(fixture.record.telegramReminderClaimToken, undefined)
    assert.equal(await run(), 1)
    assert.equal(attempts, 2)
  }
})

test('fresh claims are skipped, abandoned expired claims can recover after a crash', async () => {
  for (const age of [60_000, 180_000]) {
    const fixture = makeFixture({ telegramReminderClaimedAt: new Date(REMINDER_TIME.getTime() - age), telegramReminderClaimToken: 'old' })
    assert.equal(await createLessonReminderRunner(fixture.options)(), age < 120_000 ? 0 : 1)
  }
})

test('unlinked/inactive teachers, students, and missing teachers are not notified', async () => {
  for (const teacher of [
    null,
    { role: 'student', isActive: true, telegramId: '123' },
    { role: 'teacher', isActive: false, telegramId: '123' },
    { role: 'teacher', isActive: true },
  ]) {
    const fixture = makeFixture({ teacher })
    assert.equal(await createLessonReminderRunner(fixture.options)(), 0)
    assert.equal(fixture.calls.send.length, 0)
    assert.equal(fixture.record.telegramReminderClaimToken, undefined)
  }
})

test('other weeks, days, and periods are excluded', async () => {
  for (const overrides of [{ weekStart: '2026-11-09' }, { dayOfWeek: 3 }, { period: 6 }]) {
    const fixture = makeFixture(overrides)
    assert.equal(await createLessonReminderRunner(fixture.options)(), 0)
    assert.equal(fixture.calls.send.length, 0)
  }
})

test('does not query without a bot, outside the window, or during shutdown', async () => {
  const fixture = makeFixture()
  assert.equal(await createLessonReminderRunner({ ...fixture.options, isBotReady: () => false })(), 0)
  assert.equal(await createLessonReminderRunner({ ...fixture.options, clock: () => new Date('2026-11-17T05:00:00Z') })(), 0)
  const controller = new AbortController()
  controller.abort()
  assert.equal(await createLessonReminderRunner(fixture.options)(controller.signal), 0)
  assert.equal(fixture.calls.find.length, 0)
})

test('rechecks time after database work and skips a lesson that has started', async () => {
  const fixture = makeFixture()
  let clockReads = 0
  const run = createLessonReminderRunner({ ...fixture.options, clock: () => {
    clockReads += 1
    return clockReads < 3 ? REMINDER_TIME : new Date('2026-11-17T05:00:00Z')
  } })
  assert.equal(await run(), 0)
  assert.equal(fixture.calls.send.length, 0)
  assert.equal(fixture.record.telegramReminderClaimToken, undefined)
})

test('database failure is contained and the worker can run again', async () => {
  const fixture = makeFixture()
  const run = createLessonReminderRunner(fixture.options)
  fixture.setFailFind(true)
  assert.equal(await run(), 0)
  fixture.setFailFind(false)
  assert.equal(await run(), 1)
  assert.equal(fixture.calls.errors.length, 1)
})

test('scheduler checks immediately and supports clean cancellation', async () => {
  const fixture = makeFixture()
  const stop = startLessonReminders(fixture.options)
  await new Promise((resolve) => setImmediate(resolve))
  await stop()
  assert.equal(fixture.calls.send.length, 1)
})

test('Telegram status advertises reminders only for linked teachers with a running worker', () => {
  for (const [role, telegramId, running, enabled] of [
    ['teacher', '123', true, true],
    ['teacher', undefined, true, false],
    ['teacher', '123', false, false],
    ['student', '123', true, false],
    ['admin', '123', true, false],
  ]) {
    let result
    getTelegramStatus({ user: { role, telegramId }, app: { locals: { telegramLessonRemindersRunning: running } } }, { json: (value) => { result = value } })
    assert.equal(result.lessonReminder.enabled, enabled)
    assert.equal(result.lessonReminder.minutesBefore, 10)
    assert.equal(result.lessonReminder.timeZone, 'Asia/Tashkent')
  }
})

test('internal reminder state is hidden from lesson JSON', () => {
  const lesson = new Lesson({ telegramReminderSentAt: REMINDER_TIME, telegramReminderClaimedAt: REMINDER_TIME, telegramReminderClaimToken: 'internal' })
  const json = lesson.toJSON()
  for (const key of ['telegramReminderSentAt', 'telegramReminderClaimedAt', 'telegramReminderClaimToken']) {
    assert.equal(Object.hasOwn(json, key), false)
    assert.equal(Lesson.schema.path(key).options.select, false)
  }
})
