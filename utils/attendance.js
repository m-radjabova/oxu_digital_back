function getAttendanceDateInfo(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return { dayOfWeek: date.getUTCDay() || 7 }
}

function validateAttendanceEntries(entries, students) {
  if (!Array.isArray(entries) || entries.length !== students.length) {
    return { error: 'Guruhdagi barcha faol talabalar uchun davomat belgilang.' }
  }

  const expectedStudentIds = new Set(students.map(({ _id }) => _id.toString()))
  const seenStudentIds = new Set()
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.studentId !== 'string' ||
      !expectedStudentIds.has(entry.studentId) ||
      seenStudentIds.has(entry.studentId) ||
      !['present', 'absent'].includes(entry.status)
    ) {
      return { error: 'Davomat ma’lumotlari noto‘g‘ri.' }
    }
    seenStudentIds.add(entry.studentId)
  }

  return {
    value: entries.map(({ studentId, status }) => ({ student: studentId, status })),
  }
}

function mapStudentAttendance(records, studentId) {
  const key = studentId.toString()
  const result = []

  for (const record of records) {
    const lesson = record.lesson
    if (!lesson || !Array.isArray(lesson.groups) || !lesson.groups.length || !lesson.subject) continue

    const entry = (record.entries || []).find(
      (item) => item.student && item.student.toString() === key,
    )
    if (!entry) continue

    result.push({
      id: record._id.toString(),
      date: record.date,
      takenAt: record.takenAt,
      status: entry.status,
      lesson: {
        id: lesson._id.toString(),
        type: lesson.type || 'lecture',
        dayOfWeek: lesson.dayOfWeek,
        period: lesson.period,
        room: lesson.room || '',
        group: { name: lesson.groups.map((group) => group.name).join(', ') },
        subject: { name: lesson.subject.name, color: lesson.subject.color },
      },
    })
  }

  return result
}

module.exports = { getAttendanceDateInfo, mapStudentAttendance, validateAttendanceEntries }
