// Add a compact test timetable through the same authenticated API used by the UI.
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const app = require('../app')
const Subject = require('../models/Subject')
const Group = require('../models/Group')
const User = require('../models/User')
const Room = require('../models/Room')
const Lesson = require('../models/Lesson')
const SubjectLoad = require('../models/SubjectLoad')
const { addDays, getTodayDateKey, getWeekStart } = require('../utils/week')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 })
  const admin = await User.findOne({ role: 'admin', isActive: true })
  if (!admin || !process.env.JWT_SECRET) throw new Error('Faol admin va JWT_SECRET talab qilinadi.')
  const groups = await Group.find({ name: /^DEMO-G0[1-6]$/ }).sort({ name: 1 }).lean()
  const subjects = await Subject.find().sort({ code: 1 }).lean()
  const teachers = await User.find({ role: 'teacher', isActive: true }).lean()
  const rooms = await Room.find({ isActive: true }).sort({ number: 1 }).lean()
  if (groups.length !== 6 || rooms.length < 6) throw new Error('Sinov guruhlari yoki xonalari yetarli emas.')
  const weekStart = addDays(getWeekStart(getTodayDateKey()), 7)
  const token = jwt.sign({ sub: String(admin._id) }, process.env.JWT_SECRET, { expiresIn: '10m' })
  const server = await new Promise((resolve, reject) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); instance.on('error', reject) })
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(method, route, data) {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) })
    const body = response.status === 204 ? null : await response.json()
    return { status: response.status, body }
  }
  try {
    let created = 0, existing = 0
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const available = subjects.filter((subject) => (subject.groups || []).some((id) => String(id) === String(group._id)))
      if (available.length < 3) throw new Error(`${group.name} uchun kamida 3 ta fan kerak.`)
      for (let j = 0; j < 3; j++) {
        const subject = available[j]
        const teacher = teachers.find((item) => item.subjects.some((id) => String(id) === String(subject._id)))
        if (!teacher) throw new Error(`${subject.name} uchun o‘qituvchi topilmadi.`)
        const period = (i % 2) * 3 + j + 1
        const prior = await Lesson.findOne({ weekStart, dayOfWeek: 1, period, groups: group._id }).lean()
        if (prior) { existing++; continue }
        const body = { weekStart, dayOfWeek: 1, period, groupIds: [String(group._id)], subjectId: String(subject._id), teacherId: String(teacher._id), roomId: String(rooms[i]._id), type: ['lab', 'practice', 'lecture'][j] }
        const result = await request('POST', '/lessons', body)
        if (result.status !== 201) throw new Error(`${group.name}, ${period}-para: ${result.status} ${result.body?.message}`)
        created++
      }
    }
    // A newly reserved two-hour lab allocation is full; the next pair must be rejected.
    const sample = subjects.find((subject) => subject.groups.some((id) => String(id) === String(groups[0]._id)))
    const teacher = teachers.find((item) => item.subjects.some((id) => String(id) === String(sample._id)))
    const full = await request('POST', '/lessons', { weekStart, dayOfWeek: 2, period: 8, groupIds: [String(groups[0]._id)], subjectId: String(sample._id), teacherId: String(teacher._id), roomId: String(rooms[0]._id), type: 'lab' })
    if (full.status !== 409 || !/soat qoldi/.test(full.body?.message || '')) throw new Error(`Yuklama chegarasi tekshiruvi muvaffaqiyatsiz: ${full.status} ${full.body?.message}`)
    if (!full.body.message.includes(groups[0].name) || !full.body.message.includes(sample.name) || !full.body.message.includes('Laboratoriya') || full.body.message.includes(String(groups[0]._id))) throw new Error('Yuklama xabarida guruh, fan yoki dars turi aniq ko‘rsatilmagan.')
    const overview = await request('GET', `/subjects/load-overview?groupId=${groups[0]._id}&limit=50`)
    const row = overview.body?.items?.find((item) => item.subjectId === String(sample._id) && item.groupId === String(groups[0]._id))
    const lab = row?.types.find((item) => item.type === 'lab')
    if (overview.status !== 200 || row?.group !== groups[0].name || row?.subject !== sample.name || lab?.planned !== 2 || lab?.remaining !== 0) throw new Error('Akademik soatlar nazorati ma’lumotlari noto‘g‘ri.')
    const foreign = subjects.find((subject) => !subject.groups.some((id) => String(id) === String(groups[0]._id)))
    const foreignTeacher = teachers.find((item) => item.subjects.some((id) => String(id) === String(foreign._id)))
    const mismatch = await request('POST', '/lessons', { weekStart, dayOfWeek: 2, period: 8, groupIds: [String(groups[0]._id)], subjectId: String(foreign._id), teacherId: String(foreignTeacher._id), roomId: String(rooms[0]._id), type: 'practice' })
    if (mismatch.status !== 400 || !/biriktirilmagan/.test(mismatch.body?.message || '')) throw new Error('Fan-guruh mosligi tekshiruvi muvaffaqiyatsiz.')
    const lessons = await Lesson.find({ weekStart, groups: { $in: groups.map((g) => g._id) } }).lean()
    let gaps = 0
    for (const group of groups) for (let day = 1; day <= 6; day++) {
      const periods = lessons.filter((l) => l.dayOfWeek === day && l.groups.some((g) => String(g) === String(group._id))).map((l) => l.period).sort((a, b) => a - b)
      if (periods.some((period, index) => index > 0 && period !== periods[index - 1] + 1)) gaps++
    }
    if (gaps) throw new Error(`${gaps} ta guruh-kunda darslar orasida oyna bor.`)
    const records = await SubjectLoad.find().lean()
    const allLessons = await Lesson.find({ status: { $ne: 'cancelled' } }).lean()
    for (const record of records) {
      const count = allLessons.filter((l) => String(l.subject) === String(record.subject) && l.type === record.type && l.groups.some((g) => String(g) === String(record.group))).reduce((sum, l) => sum + (l.academicHours || 2), 0)
      if (count !== record.plannedHours) throw new Error('Rejalashtirilgan soatlar hisoblagichi darslarga mos emas.')
    }
    console.log(JSON.stringify({ weekStart, created, existing, scheduledLessons: lessons.length, groups: groups.length, gaps, fullLimitRejected: true, wrongGroupRejected: true, loadCountersMatch: true }))
  } finally { await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect() }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; void mongoose.disconnect() })
