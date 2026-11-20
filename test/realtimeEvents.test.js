const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  disconnectRealtimeUser,
  emitRealtime,
  lessonChangedEvent,
  roomsForLessons,
} = require('../utils/realtimeEvents')

test('lesson changes target admins, affected teachers, and affected groups only', () => {
  const rooms = roomsForLessons([
    {
      teacher: { _id: 'teacher-1' },
      groups: [{ _id: 'group-1' }, { _id: 'group-2' }],
    },
  ])

  assert.deepEqual(rooms, ['role:admin', 'user:teacher-1', 'group:group-1', 'group:group-2'])
})

test('attendance changes can target the teacher and students without notifying admins', () => {
  const rooms = roomsForLessons([
    { teacher: 'teacher-1', groups: ['group-1'] },
  ], { includeAdmins: false })

  assert.deepEqual(rooms, ['user:teacher-1', 'group:group-1'])
})

test('lesson change events include old and new slots without duplicate slots', () => {
  const event = lessonChangedEvent('lesson-1', [
    { weekStart: '2026-11-16', dayOfWeek: 1, period: 1 },
    { weekStart: '2026-11-16', dayOfWeek: 1, period: 1 },
    { weekStart: '2026-11-16', dayOfWeek: 2, period: 2 },
  ], 'updated')

  assert.deepEqual(event, {
    type: 'lessons:changed',
    lessonId: 'lesson-1',
    action: 'updated',
    slots: [
      { weekStart: '2026-11-16', dayOfWeek: 1, period: 1 },
      { weekStart: '2026-11-16', dayOfWeek: 2, period: 2 },
    ],
  })
})

test('realtime events are emitted once to the unique target rooms', () => {
  const emissions = []
  const req = {
    app: {
      locals: {
        io: {
          to(rooms) {
            return {
              emit(name, event) {
                emissions.push({ rooms, name, event })
              },
            }
          },
        },
      },
    },
  }
  const event = { type: 'rooms:changed' }

  emitRealtime(req, ['role:admin', 'role:admin'], event)

  assert.deepEqual(emissions, [{
    rooms: ['role:admin'],
    name: 'data:changed',
    event,
  }])
})

test('deactivated users are disconnected from their authenticated socket room', () => {
  const calls = []
  const req = {
    app: {
      locals: {
        io: {
          in(room) {
            return {
              disconnectSockets(force) {
                calls.push({ room, force })
              },
            }
          },
        },
      },
    },
  }

  disconnectRealtimeUser(req, { _id: 'student-1' })

  assert.deepEqual(calls, [{ room: 'user:student-1', force: true }])
})
