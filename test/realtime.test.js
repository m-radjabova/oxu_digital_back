const http = require('node:http')
const jwt = require('jsonwebtoken')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { io: connectSocket } = require('socket.io-client')
const User = require('../models/User')
const { createRealtimeServer } = require('../services/realtime')

test('realtime sockets authenticate and join only the current student group', { timeout: 5000 }, async () => {
  const previousSecret = process.env.JWT_SECRET
  const previousFindById = User.findById
  process.env.JWT_SECRET = 'test-secret-for-realtime'
  User.findById = (id) => ({
    select() {
      return this
    },
    async lean() {
      return id === 'student-1'
        ? { _id: { toString: () => 'student-1' }, role: 'student', group: 'group-1', isActive: true }
        : null
    },
  })

  const server = http.createServer()
  const io = createRealtimeServer(server, [])
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}`
  const client = connectSocket(url, {
    auth: { token: jwt.sign({ sub: 'student-1' }, process.env.JWT_SECRET, { expiresIn: '1m' }) },
    transports: ['websocket'],
    reconnection: false,
  })
  let invalidClient

  try {
    await new Promise((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
    })
    assert.equal((await io.in('group:group-1').fetchSockets()).length, 1)
    assert.equal((await io.in('role:admin').fetchSockets()).length, 0)

    const eventReceived = new Promise((resolve) => client.once('data:changed', resolve))
    io.to('group:group-1').emit('data:changed', { type: 'attendance:changed', lessonId: 'lesson-1' })
    assert.deepEqual(await eventReceived, { type: 'attendance:changed', lessonId: 'lesson-1' })

    invalidClient = connectSocket(url, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      reconnection: false,
    })
    const connectionError = await new Promise((resolve) => {
      invalidClient.once('connect_error', resolve)
    })
    assert.equal(connectionError.message, 'Authentication failed.')
  } finally {
    client.disconnect()
    invalidClient?.disconnect()
    await new Promise((resolve) => io.close(resolve))
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    User.findById = previousFindById
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
})
