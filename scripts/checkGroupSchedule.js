// Exercise rejection paths against existing future demo lessons without modifying them.
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const app = require('../app')
const User = require('../models/User')
const Group = require('../models/Group')
const Lesson = require('../models/Lesson')
const { addDays, getTodayDateKey, getWeekStart } = require('../utils/week')
async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 })
  const admin = await User.findOne({ role: 'admin', isActive: true })
  const group = await Group.findOne({ name: 'DEMO-G01' })
  const weekStart = addDays(getWeekStart(getTodayDateKey()), 7)
  const lessons = await Lesson.find({ groups: group._id, weekStart, dayOfWeek: 1 }).sort({ period: 1 }).lean()
  if (lessons.map((l) => l.period).join(',') !== '1,2,3') throw new Error('Tekshiruv uchun 1–2–3 jadval topilmadi.')
  const server = await new Promise((resolve, reject) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); instance.on('error', reject) })
  const token = jwt.sign({ sub: String(admin._id) }, process.env.JWT_SECRET, { expiresIn: '5m' })
  const base = `http://127.0.0.1:${server.address().port}`
  async function check(method, path, data) {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) })
    const body = await response.json()
    if (response.status !== 409 || !/oyna/.test(body.message || '')) throw new Error(`${method} ${path}: ${response.status} ${body.message}`)
  }
  try {
    const first = lessons[0]
    await check('POST', '/lessons', { weekStart, dayOfWeek: 1, period: 5, groupIds: [String(group._id)], subjectId: String(first.subject), teacherId: String(first.teacher), roomId: String(first.roomId), type: first.type })
    await check('DELETE', `/lessons/${lessons[1]._id}`)
    const last = lessons[2]
    await check('PUT', `/lessons/${last._id}`, { weekStart, dayOfWeek: 1, period: 5, groupIds: [String(group._id)], subjectId: String(last.subject), teacherId: String(last.teacher), roomId: String(last.roomId), type: last.type })
    console.log(JSON.stringify({ createGapRejected: true, deleteMiddleRejected: true, moveGapRejected: true }))
  } finally { await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect() }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; void mongoose.disconnect() })
