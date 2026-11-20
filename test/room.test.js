const { test } = require('node:test')
const assert = require('node:assert/strict')
const Lesson = require('../models/Lesson')
const Room = require('../models/Room')
const { normalizeRoomKey, roomMatchPattern } = require('../utils/room')

test('room keys ignore casing and repeated whitespace', () => {
  assert.equal(normalizeRoomKey('  702   XONA '), '702 xona')
})

test('room matching accepts legacy room values with different casing and spacing', () => {
  const pattern = roomMatchPattern(normalizeRoomKey('702 xona'))

  assert.equal(pattern.test(' 702   Xona '), true)
  assert.equal(pattern.test('703 xona'), false)
})

test('room assignments have a unique week, weekday, period, and normalized-room index', () => {
  const roomIndex = Lesson.schema.indexes().find(([keys]) => keys.roomKey === 1)

  assert.ok(roomIndex)
  assert.deepEqual(roomIndex[0], { weekStart: 1, dayOfWeek: 1, period: 1, roomKey: 1 })
  assert.equal(roomIndex[1].unique, true)
  assert.deepEqual(roomIndex[1].partialFilterExpression, { roomKey: { $type: 'string', $gt: '' } })
})

test('registered room assignments have a unique week, weekday, period, and room id index', () => {
  const roomIndex = Lesson.schema.indexes().find(([keys]) => keys.roomId === 1)

  assert.ok(roomIndex)
  assert.deepEqual(roomIndex[0], { weekStart: 1, dayOfWeek: 1, period: 1, roomId: 1 })
  assert.equal(roomIndex[1].unique, true)
  assert.deepEqual(roomIndex[1].partialFilterExpression, { roomId: { $type: 'objectId' } })
})

test('rooms are unique by number within their building and constrain supported room kinds', () => {
  const roomIndex = Room.schema.indexes().find(([keys]) => keys.building === 1 && keys.number === 1)

  assert.ok(roomIndex)
  assert.equal(roomIndex[1].unique, true)
  assert.deepEqual(Room.schema.path('kind').enumValues, ['lecture', 'classroom', 'laboratory', 'multi'])
})
