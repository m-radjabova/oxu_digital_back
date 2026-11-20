const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const app = require('../app')

let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('health endpoint reports an available API', async () => {
  const response = await fetch(`${baseUrl}/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('role-protected endpoints require a login token', async () => {
  const response = await fetch(`${baseUrl}/users`)

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /kirish talab qilinadi/i)
})

test('academic structure endpoint requires a login token', async () => {
  const response = await fetch(`${baseUrl}/academic-structure`)

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /kirish talab qilinadi/i)
})

test('building and room endpoints require a login token', async () => {
  const response = await fetch(`${baseUrl}/buildings`)

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /kirish talab qilinadi/i)
})

test('password changes require an authenticated account', async () => {
  const response = await fetch(`${baseUrl}/auth/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password' }),
  })

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /kirish talab qilinadi/i)
})

test('attendance routes require an authenticated teacher', async () => {
  const response = await fetch(`${baseUrl}/attendance?date=2026-11-12`)

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /kirish talab qilinadi/i)
})

test('teacher availability routes require an authenticated account', async () => {
  const response = await fetch(`${baseUrl}/teacher-availability`)

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /kirish talab qilinadi/i)
})

test('login validates required fields before checking the database', async () => {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /Email va parol/i)
})

test('Telegram Web App login rejects unsigned initialization data', async () => {
  const response = await fetch(`${baseUrl}/auth/telegram-webapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: 'user=%7B%22id%22%3A123%7D' }),
  })

  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /Telegram sessiyasi/i)
})

test('browser preflight allows the Vite development origin', async () => {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/)
})
