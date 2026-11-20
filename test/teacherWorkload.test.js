const test = require('node:test')
const assert = require('node:assert/strict')
const { academicPeriod, buildWorkload } = require('../utils/teacherWorkload')

test('academic years and semesters follow lesson dates, including January', () => {
  assert.deepEqual(academicPeriod('2026-09-01'), { year: 2026, semester: 'fall' })
  assert.deepEqual(academicPeriod('2027-01-31'), { year: 2026, semester: 'fall' })
  assert.deepEqual(academicPeriod('2027-02-01'), { year: 2026, semester: 'spring' })
  assert.deepEqual(academicPeriod('2027-08-31'), { year: 2026, semester: 'spring' })
})

test('combined lecture counts once, respects actual lesson date and filters rows only', () => {
  const subject = { _id: 's', name: 'Matematika', code: 'MA101' }
  const groups = [{ _id: 'a', name: 'A' }, { _id: 'b', name: 'B' }]
  const lessons = [
    { subject, groups, type: 'lecture', weekStart: '2026-11-09', dayOfWeek: 1, academicHours: 2, status: 'completed' },
    { subject, groups, type: 'lecture', weekStart: '2026-11-16', dayOfWeek: 1, academicHours: 2, status: 'planned' },
    { subject, groups: [groups[0]], type: 'lab', weekStart: '2027-02-01', dayOfWeek: 1, academicHours: 2 },
  ]
  const result = buildWorkload({ lessons, year: 2026, semester: 'fall', studentCounts: { a: 3, b: 4 } })
  assert.equal(result.totals.total, 4)
  assert.equal(result.annual.total, 6)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].students, 7)
  assert.equal(result.rows[0].completed, 2)
  const filtered = buildWorkload({ lessons, year: 2026, semester: 'fall', search: 'no-match' })
  assert.equal(filtered.rows.length, 0)
  assert.equal(filtered.totals.total, 4)
})

test('attendance recorded for a planned lesson counts completed hours once', () => {
  const lesson = { subject: { _id: 's', name: 'Fan' }, groups: [{ _id: 'g', name: 'Guruh' }], type: 'practice', weekStart: '2026-11-09', dayOfWeek: 1, academicHours: 2, status: 'planned', attendanceRecorded: true }
  const result = buildWorkload({ lessons: [lesson, { ...lesson, status: 'completed' }], year: 2026, semester: 'fall' })
  assert.equal(result.rows[0].hours, 4)
  assert.equal(result.rows[0].completed, 4)
  assert.equal(result.rows[0].subjectId, 's')
})
