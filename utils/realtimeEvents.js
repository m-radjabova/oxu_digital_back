function idOf(value) {
  if (typeof value === 'string') return value
  if (value?._id) return value._id.toString()
  if (value?.id) return value.id.toString()
  return value?.toString?.() || ''
}

function roomsForLessons(lessons, { includeAdmins = true } = {}) {
  const rooms = new Set(includeAdmins ? ['role:admin'] : [])
  for (const lesson of lessons.filter(Boolean)) {
    const teacherId = idOf(lesson.teacher)
    if (teacherId) rooms.add(`user:${teacherId}`)
    for (const group of lesson.groups || []) {
      const groupId = idOf(group)
      if (groupId) rooms.add(`group:${groupId}`)
    }
  }
  return [...rooms]
}

function lessonChangedEvent(lessonId, lessons, action) {
  const slots = new Map()
  for (const lesson of lessons.filter(Boolean)) {
    if (!lesson.weekStart || !lesson.dayOfWeek || !lesson.period) continue
    const slot = {
      weekStart: lesson.weekStart,
      dayOfWeek: lesson.dayOfWeek,
      period: lesson.period,
    }
    slots.set(`${slot.weekStart}:${slot.dayOfWeek}:${slot.period}`, slot)
  }
  return {
    type: 'lessons:changed',
    lessonId: idOf(lessonId),
    action,
    slots: [...slots.values()],
  }
}

function emitRealtime(req, rooms, event) {
  const io = req.app?.locals?.io
  const targets = [...new Set(rooms)]
  if (!io || !targets.length) return
  io.to(targets).emit('data:changed', event)
}

function disconnectRealtimeUser(req, userId) {
  const io = req.app?.locals?.io
  const id = idOf(userId)
  if (io && id) io.in(`user:${id}`).disconnectSockets(true)
}

module.exports = {
  disconnectRealtimeUser,
  emitRealtime,
  lessonChangedEvent,
  roomsForLessons,
}
