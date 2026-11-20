const test = require('node:test')
const assert = require('node:assert/strict')
const { missingPeriods } = require('../utils/groupSchedule')

test('consecutive lessons can start at any period', () => {
  for (const periods of [[], [4], [1, 2, 3], [2, 3, 4], [3, 4, 5], [6, 4, 5]]) assert.equal(missingPeriods(periods), 0)
})

test('detects gaps between a group’s lessons', () => {
  assert.equal(missingPeriods([1, 3]), 1)
  assert.equal(missingPeriods([1, 4]), 2)
  assert.equal(missingPeriods([2, 3, 5, 6]), 1)
})
