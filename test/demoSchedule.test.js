const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildDemoAssignments } = require('../utils/demoSchedule')
const { getWeekStart } = require('../utils/week')

const groups = Array.from({ length: 10 }, (_value, index) => ({ _id: `group-${index}`, name: `DEMO-G${index}` }))
const teachers = Array.from({ length: 10 }, (_value, index) => ({ _id: `teacher-${index}` }))
const subjects = Array.from({ length: 10 }, (_value, index) => ({ _id: `subject-${index}` }))

const currentWeek = getWeekStart()

test('demo schedule creates five lessons for every demo group without teacher or group collisions', () => {
  const assignments = buildDemoAssignments({ groups, teachers, subjects })

  assert.equal(assignments.length, 50)
  for (const group of groups) {
    assert.equal(assignments.filter((lesson) => lesson.groups.includes(group._id)).length, 5)
  }
  for (const lesson of assignments) {
    assert.equal(lesson.weekStart, currentWeek)
    assert.equal(lesson.groups.length, 1)
    assert.equal(lesson.type, 'practice')
  }
  assert.equal(new Set(assignments.map((lesson) => `${lesson.weekStart}:${lesson.groups[0]}:${lesson.dayOfWeek}:${lesson.period}`)).size, 50)
  assert.equal(new Set(assignments.map((lesson) => `${lesson.weekStart}:${lesson.teacher}:${lesson.dayOfWeek}:${lesson.period}`)).size, 50)
})

test('demo schedule preserves existing timetable cells and adds only missing group weekdays', () => {
  const existingLessons = [{
    groups: [groups[0]._id],
    teacher: teachers[0]._id,
    dayOfWeek: 1,
    period: 1,
    weekStart: currentWeek,
  }]

  const assignments = buildDemoAssignments({ groups, teachers, subjects, existingLessons })

  assert.equal(assignments.length, 49)
  assert.equal(assignments.some((lesson) => lesson.groups.includes(groups[0]._id) && lesson.dayOfWeek === 1), false)
  assert.equal(assignments.some((lesson) => lesson.teacher === teachers[0]._id && lesson.dayOfWeek === 1 && lesson.period === 1), false)
})

test('demo schedule builds an independent timetable for every requested week', () => {
  const nextWeek = '2099-01-05'
  const weekStarts = [currentWeek, nextWeek]
  const assignments = buildDemoAssignments({ groups, teachers, subjects, weekStarts })

  assert.equal(assignments.length, 100)
  assert.equal(assignments.filter((lesson) => lesson.weekStart === currentWeek).length, 50)
  assert.equal(assignments.filter((lesson) => lesson.weekStart === nextWeek).length, 50)

  const slotSignature = (weekStart) =>
    assignments
      .filter((lesson) => lesson.weekStart === weekStart && lesson.groups.includes(groups[0]._id))
      .sort((left, right) => left.dayOfWeek - right.dayOfWeek)
      .map((lesson) => `${lesson.dayOfWeek}:${lesson.period}`)
      .join(',')

  assert.notEqual(slotSignature(currentWeek), slotSignature(nextWeek))
})

test('demo schedule does not fill a week that is already fully planned', () => {
  const existingLessons = groups.flatMap((group, groupIndex) =>
    Array.from({ length: 5 }, (_value, dayIndex) => ({
      groups: [group._id],
      teacher: teachers[(groupIndex + dayIndex) % teachers.length]._id,
      dayOfWeek: dayIndex + 1,
      period: (groupIndex % 8) + 1,
      weekStart: currentWeek,
    })),
  )

  const nextWeek = '2099-01-05'
  const assignments = buildDemoAssignments({
    groups,
    teachers,
    subjects,
    weekStarts: [currentWeek, nextWeek],
    existingLessons,
  })
  const filledWeek = assignments.filter((lesson) => lesson.weekStart === currentWeek)

  assert.equal(filledWeek.length, 0)
  assert.equal(assignments.length, 50)
  assert.equal(assignments.every((lesson) => lesson.weekStart === nextWeek), true)
})

test('demo lessons use teachers assigned to the group direction and lesson subject', () => {
  const scopedGroups = [
    { _id: 'group-one', name: 'DEMO-G01', direction: 'direction-one' },
  ]
  const scopedTeachers = [
    { _id: 'teacher-other', subjects: ['subject-one'], directions: ['direction-two'] },
    { _id: 'teacher-match', subjects: ['subject-one'], directions: ['direction-one'] },
  ]
  const scopedSubjects = [{ _id: 'subject-one' }]

  const assignments = buildDemoAssignments({
    groups: scopedGroups,
    teachers: scopedTeachers,
    subjects: scopedSubjects,
  })

  test('demo lessons use unique registered rooms for each week and time slot', () => {
    const rooms = Array.from({ length: 10 }, (_value, index) => ({
      _id: `room-${index}`,
      number: String(701 + index),
      kind: 'classroom',
      building: { name: '4-bino' },
    }))
    const assignments = buildDemoAssignments({ groups, teachers, subjects, rooms })

    assert.equal(assignments.length, 50)
    assert.ok(assignments.every((lesson) => lesson.roomId && lesson.room.startsWith('4-bino ')))
    assert.equal(
      new Set(assignments.map((lesson) => `${lesson.weekStart}:${lesson.dayOfWeek}:${lesson.period}:${lesson.roomId}`)).size,
      assignments.length,
    )
  })

  assert.equal(assignments.length, 5)
  assert.equal(assignments.every((lesson) => lesson.teacher === 'teacher-match'), true)
  assert.equal(assignments.every((lesson) => lesson.subject === 'subject-one'), true)
})

test('demo seed structure produces a complete schedule within teacher assignments', () => {
  const directions = ['direction-0', 'direction-1', 'direction-2']
  const demoGroups = Array.from({ length: 10 }, (_value, index) => ({
    _id: `group-${index}`,
    name: `DEMO-G${String(index + 1).padStart(2, '0')}`,
    direction: directions[index % directions.length],
  }))
  const demoSubjects = Array.from({ length: 10 }, (_value, index) => ({ _id: `subject-${index}` }))
  const demoTeachers = Array.from({ length: 10 }, (_value, index) => {
    const firstSubjectIndex = (index * 3) % demoSubjects.length
    const assignedDirections = [directions[index % directions.length]]
    if (index % 2 === 1) assignedDirections.push(directions[(index + 1) % directions.length])
    return {
      _id: `teacher-${index}`,
      directions: assignedDirections,
      subjects: [0, 1, 2, 3, 4].map((offset) => demoSubjects[(firstSubjectIndex + offset) % demoSubjects.length]._id),
    }
  })

  const assignments = buildDemoAssignments({
    groups: demoGroups,
    teachers: demoTeachers,
    subjects: demoSubjects,
    weekStarts: [currentWeek],
  })

  assert.equal(assignments.length, 50)
  for (const assignment of assignments) {
    const teacher = demoTeachers.find(({ _id }) => _id === assignment.teacher)
    const group = demoGroups.find(({ _id }) => _id === assignment.groups[0])
    assert.ok(teacher.subjects.includes(assignment.subject))
    assert.ok(teacher.directions.includes(group.direction))
  }
})
