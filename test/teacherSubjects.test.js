const { test } = require('node:test')
const assert = require('node:assert/strict')
const { canTeachSubject } = require('../utils/teacherSubjects')

test('an unassigned teacher cannot receive a lesson until a subject is assigned', () => {
  assert.equal(canTeachSubject([], 'subject-1'), false)
})

test('a teacher can only receive lessons in subjects already on their schedule', () => {
  assert.equal(canTeachSubject(['subject-1', 'subject-2'], 'subject-2'), true)
  assert.equal(canTeachSubject(['subject-1'], 'subject-2'), false)
})
