const { getWeekStart } = require('./week')
const { formatRoomName, normalizeRoomKey } = require('./room')

function roomSupportsLesson(room, type) {
  return room.kind === 'multi' || (type === 'lab'
    ? room.kind === 'laboratory'
    : room.kind !== 'laboratory')
}

function buildDemoAssignments({ groups, teachers, subjects, weekStarts, existingLessons = [], rooms = [] }) {
  const weeks = Array.isArray(weekStarts) && weekStarts.length ? weekStarts : [getWeekStart()]
  const occupiedGroupSlots = new Set()
  const occupiedTeacherSlots = new Set()
  const occupiedRoomSlots = new Set()
  const groupsWithDayLesson = new Set()
  const roomIdByKey = new Map(rooms.map((room) => [
    normalizeRoomKey(formatRoomName(room.building.name, room.number)),
    room._id.toString(),
  ]))

  for (const lesson of existingLessons) {
    if (!lesson.weekStart) continue
    const groupIds = (Array.isArray(lesson.groups) ? lesson.groups : lesson.group ? [lesson.group] : []).map(String)
    const teacherId = lesson.teacher.toString()
    for (const groupId of groupIds) {
      occupiedGroupSlots.add(`${groupId}:${lesson.weekStart}:${lesson.dayOfWeek}:${lesson.period}`)
      groupsWithDayLesson.add(`${groupId}:${lesson.weekStart}:${lesson.dayOfWeek}`)
    }
    occupiedTeacherSlots.add(`${teacherId}:${lesson.weekStart}:${lesson.dayOfWeek}:${lesson.period}`)
    const roomId = lesson.roomId?.toString() || roomIdByKey.get(normalizeRoomKey(lesson.room || ''))
    if (roomId) {
      occupiedRoomSlots.add(`${roomId}:${lesson.weekStart}:${lesson.dayOfWeek}:${lesson.period}`)
    }
  }

  const assignments = []
  for (const [weekIndex, weekStart] of weeks.entries()) {
    for (const [groupIndex, group] of groups.entries()) {
      for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
        const groupId = group._id.toString()
        if (groupsWithDayLesson.has(`${groupId}:${weekStart}:${dayOfWeek}`)) continue

        const teacherOffset = (groupIndex + dayOfWeek - 1) % teachers.length
        const periodOffset = (groupIndex * 2 + dayOfWeek - 1 + weekIndex * 3) % 8
        const subject = subjects[(groupIndex + dayOfWeek - 1) % subjects.length]
        let assignment

        for (let teacherIndex = 0; teacherIndex < teachers.length && !assignment; teacherIndex += 1) {
          const teacher = teachers[(teacherOffset + teacherIndex) % teachers.length]
          const teacherSubjects = (teacher.subjects || []).map(String)
          if (teacherSubjects.length && !teacherSubjects.includes(subject._id.toString())) continue
          const teacherDirections = (teacher.directions || []).map(String)
          if (
            group.direction &&
            teacherDirections.length &&
            !teacherDirections.includes(group.direction.toString())
          ) continue

          for (let periodIndex = 0; periodIndex < 8; periodIndex += 1) {
            const period = ((periodOffset + periodIndex) % 8) + 1
            const groupSlot = `${groupId}:${weekStart}:${dayOfWeek}:${period}`
            const teacherSlot = `${teacher._id}:${weekStart}:${dayOfWeek}:${period}`
            if (occupiedGroupSlots.has(groupSlot) || occupiedTeacherSlots.has(teacherSlot)) continue

            const room = rooms.length
              ? rooms.find((candidate) =>
                roomSupportsLesson(candidate, 'practice')
                && !occupiedRoomSlots.has(`${candidate._id}:${weekStart}:${dayOfWeek}:${period}`),
              )
              : null
            if (rooms.length && !room) continue
            const roomName = room
              ? formatRoomName(room.building.name, room.number)
              : `A-${100 + ((groupIndex * 8 + period) % 80)}`
            assignment = {
              groups: [group._id],
              type: 'practice',
              teacher: teacher._id,
              subject: subject._id,
              dayOfWeek,
              period,
              weekStart,
              room: roomName,
              ...(room ? { roomId: room._id } : {}),
              roomKey: normalizeRoomKey(roomName),
            }
            occupiedGroupSlots.add(groupSlot)
            occupiedTeacherSlots.add(teacherSlot)
            if (room) occupiedRoomSlots.add(`${room._id}:${weekStart}:${dayOfWeek}:${period}`)
            groupsWithDayLesson.add(`${groupId}:${weekStart}:${dayOfWeek}`)
            assignments.push(assignment)
            break
          }
        }

        if (!assignment) {
          throw new Error(`Demo schedule has no free slot for group ${group.name} on weekday ${dayOfWeek} (${weekStart}).`)
        }
      }
    }
  }

  return assignments
}

module.exports = { buildDemoAssignments }
