const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ACADEMIC_HOUR_MINUTES,
  PAIR_DURATION_MINUTES,
  ACADEMIC_HOURS_PER_PAIR,
  canReserveHours,
} = require('../utils/academicLoad')

test('a pair stores 80 real minutes and two academic hours', () => {
  assert.equal(ACADEMIC_HOUR_MINUTES, 40)
  assert.equal(PAIR_DURATION_MINUTES, 80)
  assert.equal(ACADEMIC_HOURS_PER_PAIR, 2)
})

test('30 lecture hours allow 15 pairs and block the sixteenth', () => {
  assert.equal(canReserveHours({ allocated: 30, planned: 28 }), true)
  assert.equal(canReserveHours({ allocated: 30, planned: 30 }), false)
})

test('each combined-lecture group has an independent load limit', () => {
  assert.equal(canReserveHours({ allocated: 30, planned: 28 }), true)
  assert.equal(canReserveHours({ allocated: 30, planned: 30 }), false)
  assert.equal(canReserveHours({ allocated: 20, planned: 18 }), true)
})

test('eight academic hours allow exactly four pairs', () => {
  for (const planned of [0, 2, 4, 6]) assert.equal(canReserveHours({ allocated: 8, planned }), true)
  assert.equal(canReserveHours({ allocated: 8, planned: 8 }), false)
})
