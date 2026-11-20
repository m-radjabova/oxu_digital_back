const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getAttendanceDateInfo, mapStudentAttendance, validateAttendanceEntries } = require('../utils/attendance')

test('attendance dates are calendar-valid and map to the timetable weekday', () => {
  assert.deepEqual(getAttendanceDateInfo('2026-11-12'), { dayOfWeek: 4 })
  assert.equal(getAttendanceDateInfo('2026-02-30'), null)
  assert.equal(getAttendanceDateInfo('12-11-2026'), null)
})

test('attendance requires exactly one valid status for every roster student', () => {
  const students = [{ _id: 'student-1' }, { _id: 'student-2' }]

  assert.deepEqual(validateAttendanceEntries([
    { studentId: 'student-1', status: 'present' },
    { studentId: 'student-2', status: 'absent' },
  ], students).value, [
    { student: 'student-1', status: 'present' },
    { student: 'student-2', status: 'absent' },
  ])
  assert.ok(validateAttendanceEntries([{ studentId: 'student-1', status: 'present' }], students).error)
  assert.ok(validateAttendanceEntries([
    { studentId: 'student-1', status: 'present' },
    { studentId: 'student-1', status: 'absent' },
  ], students).error)
})

test('student attendance history keeps only the requesting student entry', () => {
  const takenAt = new Date('2026-11-12T09:15:00.000Z')
  const records = [
    {
      _id: 'record-1',
      date: '2026-11-12',
      takenAt,
      lesson: {
        _id: 'lesson-1',
        type: 'lecture',
        dayOfWeek: 4,
        period: 2,
        room: 'A-158',
        groups: [{ name: 'DEMO-G08' }],
        subject: { name: 'Matematika', color: '#6a3ce0' },
      },
      entries: [
        { student: 'student-1', status: 'present' },
        { student: 'student-2', status: 'absent' },
      ],
    },
    { _id: 'record-2', date: '2026-11-11', lesson: null, entries: [{ student: 'student-2', status: 'present' }] },
    {
      _id: 'record-3',
      date: '2026-11-10',
      lesson: {
        _id: 'lesson-3',
        dayOfWeek: 2,
        period: 1,
        room: '',
        groups: [{ name: 'DEMO-G08' }],
        subject: { name: 'Fizika', color: '#0ea5e9' },
      },
      entries: [],
    },
  ]

  assert.deepEqual(mapStudentAttendance(records, 'student-2'), [
    {
      id: 'record-1',
      date: '2026-11-12',
      takenAt,
      status: 'absent',
      lesson: {
        id: 'lesson-1',
        type: 'lecture',
        dayOfWeek: 4,
        period: 2,
        room: 'A-158',
        group: { name: 'DEMO-G08' },
        subject: { name: 'Matematika', color: '#6a3ce0' },
      },
    },
  ])
})
