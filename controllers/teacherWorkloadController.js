const ExcelJS = require('exceljs')
const Lesson = require('../models/Lesson')
const Attendance = require('../models/Attendance')
const { addDays } = require('../utils/week')
const User = require('../models/User')
const { academicPeriod, currentAcademicYear, buildWorkload } = require('../utils/teacherWorkload')

async function report(req) {
  const year = req.query.year === undefined ? currentAcademicYear() : Number(req.query.year)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return { error: 'O‘quv yilini tekshiring.' }
  const semester = req.query.semester || 'fall'
  if (!['fall', 'spring', 'all'].includes(semester)) return { error: 'Semestrni tekshiring.' }
  const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : ''
  const lessons = await Lesson.find({ teacher: req.user._id, status: { $ne: 'cancelled' } }).select('subject groups type academicHours status weekStart dayOfWeek').populate('subject', 'name code').populate('groups', 'name').lean()
  const groupIds = [...new Set(lessons.flatMap((item) => (item.groups || []).filter(Boolean).map((g) => String(g._id))))]
  const [counts, profile, attendance] = await Promise.all([
    User.aggregate([{ $match: { role: 'student', isActive: true, group: { $in: groupIds.map((id) => new (require('mongoose').Types.ObjectId)(id)) } } }, { $group: { _id: '$group', count: { $sum: 1 } } }]),
    User.findById(req.user._id).select('name email directions').populate({ path: 'directions', select: 'department', populate: { path: 'department', select: 'name' } }).lean(),
    Attendance.find({ lesson: { $in: lessons.map((lesson) => lesson._id) } }).select('lesson date').lean(),
  ])
  const attendanceKeys = new Set(attendance.map((record) => `${record.lesson}:${record.date}`))
  for (const lesson of lessons) lesson.attendanceRecorded = attendanceKeys.has(`${lesson._id}:${addDays(lesson.weekStart, lesson.dayOfWeek - 1)}`)
  const studentCounts = Object.fromEntries(counts.map((item) => [String(item._id), item.count]))
  const years = [...new Set([currentAcademicYear(), ...lessons.map((item) => academicPeriod(require('../utils/week').addDays(item.weekStart, item.dayOfWeek - 1)).year)])].sort((a, b) => b - a)
  const departments = [...new Set((profile?.directions || []).map((item) => item.department?.name).filter(Boolean))]
  return { year, semester, years, teacher: { name: profile?.name || '', email: profile?.email || '', departments }, ...buildWorkload({ lessons, year, semester, search, studentCounts }) }
}
async function myWorkload(req, res) {
  const data = await report(req)
  if (data.error) return res.status(400).json({ message: data.error })
  res.json(data)
}
async function exportMyWorkload(req, res) {
  const data = await report(req)
  if (data.error) return res.status(400).json({ message: data.error })
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Yuklamalar')
  sheet.addRow(['O‘qituvchi', data.teacher.name])
  sheet.addRow(['O‘quv yili', `${data.year}–${data.year + 1}`])
  sheet.addRow(['Davr', { fall: 'Kuzgi semestr', spring: 'Bahorgi semestr', all: 'O‘quv yili' }[data.semester]])
  sheet.addRow([])
  sheet.addRow(['№', 'Guruhlar', 'Fan', 'Fan kodi', 'Dars turi', 'Rejalashtirilgan soat', 'O‘tilgan soat', 'Talabalar soni'])
  const typeNames = { lecture: 'Ma’ruza', practice: 'Amaliyot', lab: 'Laboratoriya' }
  data.rows.forEach((row, index) => sheet.addRow([index + 1, row.groups.join(', '), row.subject, row.code, typeNames[row.type] || row.type, row.hours, row.completed, row.students]))
  sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123565' } }
  sheet.columns.forEach((column, index) => { column.width = [8, 28, 35, 16, 18, 24, 20, 20][index] })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="mening-yuklamalarim-${data.year}.xlsx"`)
  await workbook.xlsx.write(res)
  res.end()
}
module.exports = { myWorkload, exportMyWorkload }
