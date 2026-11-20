const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildDemoAccountSpecs, buildDemoLessonCleanupFilter } = require('../utils/demoSeed')

test('demo account specs use the requested domain and bounded student count', () => {
  const accounts = buildDemoAccountSpecs({
    teachers: ['Teacher One', 'Teacher Two'],
    groupNames: ['DEMO-G01'],
    studentsPerGroup: 2,
    emailDomain: 'gmail.com',
  })

  assert.deepEqual(accounts.map(({ email }) => email), [
    'teacher01@gmail.com',
    'teacher02@gmail.com',
    'student01.g01@gmail.com',
    'student02.g01@gmail.com',
  ])
})

test('demo lesson cleanup never builds a database-wide delete filter', () => {
  assert.equal(buildDemoLessonCleanupFilter([], []), null)
  assert.deepEqual(buildDemoLessonCleanupFilter(['group-1'], ['teacher-1']), {
    $or: [
      { groups: { $in: ['group-1'] } },
      { teacher: { $in: ['teacher-1'] } },
    ],
  })
})
