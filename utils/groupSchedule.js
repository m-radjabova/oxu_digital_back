const Group = require('../models/Group')
const Lesson = require('../models/Lesson')

function missingPeriods(periods) {
  const sorted = [...new Set(periods)].sort((a, b) => a - b)
  if (sorted.length < 2) return 0
  return sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length
}

// Lock every affected group in the transaction. Concurrent schedule changes then
// retry against the latest schedule instead of independently creating a gap.
async function validateGroupSchedule({ oldLesson = null, newLesson = null, session }) {
  const groupIds = [...new Set([...(oldLesson?.groups || []), ...(newLesson?.groups || [])].map(String))].sort()
  for (const id of groupIds) await Group.updateOne({ _id: id }, { $inc: { scheduleRevision: 1 } }, { session })
  const slots = new Map()
  for (const lesson of [oldLesson, newLesson]) {
    if (!lesson || lesson.status === 'cancelled') continue
    for (const group of lesson.groups || []) {
      const key = `${group}:${lesson.weekStart}:${lesson.dayOfWeek}`
      slots.set(key, { group, weekStart: lesson.weekStart, dayOfWeek: lesson.dayOfWeek })
    }
  }
  for (const { group, weekStart, dayOfWeek } of slots.values()) {
    const existing = await Lesson.find({ groups: group, weekStart, dayOfWeek, status: { $ne: 'cancelled' } }).select('_id period').session(session).lean()
    const before = existing.map((lesson) => lesson.period)
    const after = existing.filter((lesson) => !oldLesson || String(lesson._id) !== String(oldLesson._id)).map((lesson) => lesson.period)
    if (newLesson && newLesson.status !== 'cancelled' && newLesson.weekStart === weekStart && newLesson.dayOfWeek === dayOfWeek && newLesson.groups.some((id) => String(id) === String(group))) after.push(newLesson.period)
    // Existing gaps may be repaired incrementally, but cannot be made worse.
    if (missingPeriods(after) > missingPeriods(before)) {
      const error = new Error('Guruh darslari orasida bo‘sh para (oyna) qolmasligi kerak. Ketma-ket parani tanlang.')
      error.code = 'GROUP_SCHEDULE_GAP'
      throw error
    }
  }
}
module.exports = { missingPeriods, validateGroupSchedule }
