// Integration check with an isolated temporary account and a mocked Telegram sender.
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const User = require('../models/User')
const PasswordReset = require('../models/PasswordReset')
const { setTelegramBot } = require('../services/telegramNotification')
const app = require('../app')
async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 })
  let message = ''
  setTelegramBot({ telegram: { sendMessage: async (_id, text) => { message = text } } })
  const email = `reset-test-${crypto.randomBytes(8).toString('hex')}@example.test`
  const user = await User.create({ name: 'Reset integration test', email, password: await bcrypt.hash('old-test-password', 12), role: 'student', telegramId: `test-${crypto.randomBytes(8).toString('hex')}` })
  let server
  try {
    server = await new Promise((resolve, reject) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); instance.on('error', reject) })
    const base = `http://127.0.0.1:${server.address().port}`
    async function post(path, data) { const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); return { status: response.status, body: await response.json() } }
    const login = await post('/auth/login', { email, password: 'old-test-password' })
    if (login.status !== 200) throw new Error('Old login failed')
    const unknown = await post('/auth/forgot-password', { email: 'missing@example.test' })
    const sent = await post('/auth/forgot-password', { email })
    if (sent.status !== 200 || sent.body.message !== unknown.body.message) throw new Error('Reset request privacy failed')
    const url = message.match(/https?:\/\/[^\s]+/)?.[0]
    const token = url && new URL(url).searchParams.get('token')
    if (!token) throw new Error('Telegram reset link missing')
    const invalid = await post('/auth/reset-password', { token, password: 'short' })
    const updated = await post('/auth/reset-password', { token, password: 'new-test-password' })
    const reused = await post('/auth/reset-password', { token, password: 'another-test-password' })
    const oldSession = await fetch(base + '/auth/me', { headers: { authorization: `Bearer ${login.body.token}` } })
    const relogin = await post('/auth/login', { email, password: 'new-test-password' })
    if (invalid.status !== 400 || updated.status !== 200 || reused.status !== 400 || oldSession.status !== 401 || relogin.status !== 200) throw new Error(`Reset flow failed ${invalid.status}/${updated.status}/${reused.status}/${oldSession.status}/${relogin.status}`)
    console.log(JSON.stringify({ genericResponses: true, telegramLink: true, shortRejected: true, resetSuccessful: true, reuseRejected: true, oldSessionRevoked: true, newLogin: true }))
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    await PasswordReset.deleteMany({ user: user._id }); await User.deleteOne({ _id: user._id }); await mongoose.disconnect()
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; void mongoose.disconnect() })
