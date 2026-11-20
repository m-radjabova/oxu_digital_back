const { randomUUID } = require('node:crypto')
const Lesson = require('../models/Lesson')
const { formatRoomName } = require('../utils/room')
const { getTodayDateKey, getWeekStart, parseDateKey } = require('../utils/week')
const {
  getTelegramBot,
  notifyTeacherLessonReminder,
  LESSON_REMINDER_MINUTES,
  PERIOD_TIMES,
} = require('./telegramNotification')

const REMINDER_TIME_ZONE = 'Asia/Tashkent'
const POLL_INTERVAL_MS = 15_000
const CLAIM_LEASE_MS = 120_000
const SEND_TIMEOUT_MS = 30_000
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: REMINDER_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function getReminderWindow(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null
  const dateKey = getTodayDateKey(now)
  const dayOfWeek = ((parseDateKey(dateKey).getUTCDay() + 6) % 7) + 1
  if (dayOfWeek > 6) return null
  const parts = Object.fromEntries(timeFormatter.formatToParts(now).map(({ type, value }) => [type, value]))
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute)
    + Number(parts.second) / 60 + now.getMilliseconds() / 60_000
  const minutesByPeriod = new Map()
  for (const [number, range] of Object.entries(PERIOD_TIMES)) {
    const [hour, minute] = range.slice(0, 5).split(':').map(Number)
    const remaining = hour * 60 + minute - currentMinutes
    if (remaining > 0 && remaining <= LESSON_REMINDER_MINUTES) {
      minutesByPeriod.set(Number(number), Math.ceil(remaining))
    }
  }
  if (!minutesByPeriod.size) return null
  return { dateKey, weekStart: getWeekStart(dateKey), dayOfWeek, minutesByPeriod }
}

function createLessonReminderRunner({
  LessonModel = Lesson,
  sendReminder = notifyTeacherLessonReminder,
  isBotReady = () => Boolean(getTelegramBot()),
  clock = () => new Date(),
  logger = console,
} = {}) {
  let running = false
  return async function run(signal) {
    if (running || signal?.aborted || !isBotReady()) return 0
    const window = getReminderWindow(clock())
    if (!window) return 0
    running = true
    let sentCount = 0
    try {
      const slotFilter = {
        weekStart: window.weekStart,
        dayOfWeek: window.dayOfWeek,
        period: { $in: [...window.minutesByPeriod.keys()] },
        telegramReminderSentAt: null,
      }
      const candidates = await LessonModel.find(slotFilter).select('_id').lean()
      for (const candidate of candidates) {
        if (signal?.aborted) break
        const token = randomUUID()
        const claimedAt = clock()
        // The atomic lease prevents concurrent servers from claiming the same lesson.
        const lesson = await LessonModel.findOneAndUpdate({
          ...slotFilter,
          _id: candidate._id,
          $or: [
            { telegramReminderClaimedAt: null },
            { telegramReminderClaimedAt: { $lte: new Date(claimedAt.getTime() - CLAIM_LEASE_MS) } },
          ],
        }, {
          $set: { telegramReminderClaimedAt: claimedAt, telegramReminderClaimToken: token },
        }, { new: true, timestamps: false })
          .populate({
            path: 'teacher',
            select: 'name telegramId role isActive',
            match: { role: 'teacher', isActive: true, telegramId: { $exists: true, $nin: [null, ''] } },
          })
          .populate('subject', 'name')
          .populate('groups', 'name')
          .populate({ path: 'roomId', select: 'number building', populate: { path: 'building', select: 'name' } })
        if (!lesson) continue

        const claimFilter = { _id: lesson._id, telegramReminderClaimToken: token }
        let delivered = false
        try {
          // Recheck time after DB work/previous sends; never remind about a started lesson.
          const currentWindow = getReminderWindow(clock())
          const minutesBefore = currentWindow?.dateKey === window.dateKey
            ? currentWindow.minutesByPeriod.get(lesson.period)
            : null
          if (lesson.teacher && minutesBefore && !signal?.aborted) {
            if (lesson.roomId?.building?.name) {
              lesson.room = formatRoomName(lesson.roomId.building.name, lesson.roomId.number)
            }
            const timeout = AbortSignal.timeout(SEND_TIMEOUT_MS)
            const sendSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
            delivered = await sendReminder({ lesson, minutesBefore, signal: sendSignal })
          }
        } catch (error) {
          logger.error('[TelegramReminder] Delivery failed:', error.message)
        }
        // Save delivery before releasing the lease. A failed send can retry on the next tick.
        await LessonModel.updateOne(claimFilter, {
          ...(delivered ? { $set: { telegramReminderSentAt: clock() } } : {}),
          $unset: { telegramReminderClaimedAt: 1, telegramReminderClaimToken: 1 },
        }, { timestamps: false })
        if (delivered) sentCount += 1
      }
    } catch (error) {
      logger.error('[TelegramReminder] Reminder check failed:', error.message)
    } finally {
      running = false
    }
    return sentCount
  }
}

function startLessonReminders(options = {}) {
  const run = createLessonReminderRunner(options)
  const controller = new AbortController()
  let inFlight = null
  const tick = () => {
    if (inFlight) return
    inFlight = run(controller.signal).finally(() => { inFlight = null })
  }
  const timer = setInterval(tick, POLL_INTERVAL_MS)
  timer.unref()
  tick()
  return async function stopLessonReminders() {
    clearInterval(timer)
    controller.abort()
    await inFlight
  }
}

module.exports = { createLessonReminderRunner, getReminderWindow, startLessonReminders, REMINDER_TIME_ZONE }
