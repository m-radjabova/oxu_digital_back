const { addDays, getTodayDateKey } = require('./week')

function academicPeriod(date) {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7))
  return { year: month >= 9 ? year : year - 1, semester: month >= 9 || month === 1 ? 'fall' : 'spring' }
}
function currentAcademicYear() { return academicPeriod(getTodayDateKey()).year }
function totals(items) {
  const value = { lecture: 0, practice: 0, lab: 0, total: 0 }
  for (const item of items) { if (Object.hasOwn(value, item.type) && item.type !== 'total') value[item.type] += item.academicHours || 2; value.total += item.academicHours || 2 }
  return value
}
function buildWorkload({ lessons, year, semester, search = '', studentCounts = {} }) {
  const yearLessons = lessons.filter((item) => academicPeriod(addDays(item.weekStart, item.dayOfWeek - 1)).year === year)
  const selected = yearLessons.filter((item) => semester === 'all' || academicPeriod(addDays(item.weekStart, item.dayOfWeek - 1)).semester === semester)
  const map = new Map()
  for (const lesson of selected) {
    if (!lesson.subject || !(lesson.groups || []).length) continue
    const groups = [...lesson.groups].filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'uz'))
    const key = `${lesson.subject._id}:${lesson.type}:${groups.map((g) => g._id).sort().join(',')}`
    const row = map.get(key) || { subjectId: String(lesson.subject._id), subject: lesson.subject.name, code: lesson.subject.code || '', groups: groups.map((g) => g.name), groupIds: groups.map((g) => String(g._id)), type: lesson.type, hours: 0, completed: 0, students: groups.reduce((sum, g) => sum + (studentCounts[String(g._id)] || 0), 0) }
    row.hours += lesson.academicHours || 2
    if (lesson.status === 'completed' || lesson.attendanceRecorded) row.completed += lesson.academicHours || 2
    map.set(key, row)
  }
  const needle = search.trim().toLocaleLowerCase()
  const rows = [...map.values()].filter((row) => `${row.subject} ${row.code} ${row.groups.join(' ')}`.toLocaleLowerCase().includes(needle)).sort((a, b) => a.subject.localeCompare(b.subject, 'uz') || a.groups.join().localeCompare(b.groups.join(), 'uz'))
  return { rows, totals: totals(selected), annual: totals(yearLessons) }
}
module.exports = { academicPeriod, currentAcademicYear, buildWorkload }
