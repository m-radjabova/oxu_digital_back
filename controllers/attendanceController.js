const mongoose = require('mongoose')
const Attendance = require('../models/Attendance')
const Lesson = require('../models/Lesson')
const User = require('../models/User')
const { getAttendanceDateInfo, mapStudentAttendance, validateAttendanceEntries } = require('../utils/attendance')
const { getWeekStart, isDateInWeek } = require('../utils/week')
const { emitRealtime, roomsForLessons } = require('../utils/realtimeEvents')

async function getTeacherLesson(lessonId, teacherId) {
  return Lesson.findOne({ _id: lessonId, teacher: teacherId })
    .populate('groups', 'name')
    .populate('subject', 'name color')
    .populate('teacher', 'name email')
}

async function getRoster(groupIds) {
  return User.find({ group: { $in: groupIds }, role: 'student', isActive: true })
    .select('name email group')
    .populate('group', 'name')
    .sort({ name: 1 })
    .lean()
}

function publicLesson(lesson) {
  return {
    id: lesson._id.toString(),
    dayOfWeek: lesson.dayOfWeek,
    period: lesson.period,
    room: lesson.room,
    type: lesson.type,
    groups: lesson.groups.map((group) => ({ id: group._id.toString(), name: group.name })),
    subject: { id: lesson.subject._id.toString(), name: lesson.subject.name },
  }
}

function publicAttendance(attendance) {
  if (!attendance) return null
  return {
    id: attendance._id.toString(),
    takenAt: attendance.takenAt,
    note: attendance.note || '',
    entries: attendance.entries.map(({ student, status }) => ({
      student: student
        ? { id: student._id.toString(), name: student.name, email: student.email }
        : null,
      status,
    })),
  }
}

async function listAttendanceStatuses(req, res) {
  const dateInfo = getAttendanceDateInfo(req.query.date)
  if (!dateInfo) return res.status(400).json({ message: 'Davomat sanasi YYYY-MM-DD formatida bo‘lishi kerak.' })

  const lessons = await Lesson.find({
    teacher: req.user._id,
    dayOfWeek: dateInfo.dayOfWeek,
    weekStart: getWeekStart(req.query.date),
  }).select('_id').lean()
  if (!lessons.length) return res.json([])

  const records = await Attendance.find({
    lesson: { $in: lessons.map(({ _id }) => _id) },
    date: req.query.date,
  }).select('lesson').lean()
  res.json(records.map(({ lesson }) => ({ lessonId: lesson.toString() })))
}

async function getMyAttendance(req, res) {
  const records = await Attendance.find({ 'entries.student': req.user._id })
    .sort({ date: -1, takenAt: -1 })
    .limit(200)
    .populate({
      path: 'lesson',
      select: 'dayOfWeek period room groups subject type',
      populate: [
        { path: 'groups', select: 'name' },
        { path: 'subject', select: 'name color' },
      ],
    })
    .lean()

  res.json(mapStudentAttendance(records, req.user._id))
}

async function getLessonAttendance(req, res) {
  const dateInfo = getAttendanceDateInfo(req.query.date)
  if (!dateInfo) return res.status(400).json({ message: 'Davomat sanasi YYYY-MM-DD formatida bo‘lishi kerak.' })

  const lesson = await getTeacherLesson(req.params.lessonId, req.user._id)
  if (!lesson) return res.status(404).json({ message: 'Sizga biriktirilgan dars topilmadi.' })
  if (lesson.dayOfWeek !== dateInfo.dayOfWeek || !isDateInWeek(req.query.date, lesson.weekStart)) {
    return res.status(400).json({ message: 'Tanlangan sana bu darsning haftasi va kuniga mos emas.' })
  }

  const [students, attendance] = await Promise.all([
    getRoster(lesson.groups.map((group) => group._id)),
    Attendance.findOne({ lesson: lesson._id, date: req.query.date })
      .populate('entries.student', 'name email')
      .lean(),
  ])
  const previousLessons = await Lesson.find({ teacher: req.user._id, subject: lesson.subject._id, groups: { $all: lesson.groups.map((group) => group._id), $size: lesson.groups.length } }).select('_id').lean()
  const previousAttendance = await Attendance.findOne({ lesson: { $in: previousLessons.map((item) => item._id) }, date: { $lt: req.query.date } }).sort({ date: -1, takenAt: -1 }).populate('entries.student', 'name email').lean()
  res.json({
    lesson: publicLesson(lesson),
    date: req.query.date,
    students: students.map(({ _id, name, email, group }) => ({ id: _id.toString(), name, email, group: group ? { id: group._id.toString(), name: group.name } : null })),
    attendance: publicAttendance(attendance),
    previousAttendance: publicAttendance(previousAttendance),
  })
}

async function takeAttendance(req, res) {
  const dateInfo = getAttendanceDateInfo(req.body?.date)
  if (!dateInfo) return res.status(400).json({ message: 'Davomat sanasi YYYY-MM-DD formatida bo‘lishi kerak.' })

  const lesson = await getTeacherLesson(req.params.lessonId, req.user._id)
  if (!lesson) return res.status(404).json({ message: 'Sizga biriktirilgan dars topilmadi.' })
  if (lesson.dayOfWeek !== dateInfo.dayOfWeek || !isDateInWeek(req.body?.date, lesson.weekStart)) {
    return res.status(400).json({ message: 'Tanlangan sana bu darsning haftasi va kuniga mos emas.' })
  }

  const students = await getRoster(lesson.groups.map((group) => group._id))
  if (!students.length) return res.status(400).json({ message: 'Guruhda faol talaba yo‘q.' })

  const result = validateAttendanceEntries(req.body?.entries, students)
  if (result.error) return res.status(400).json({ message: result.error })
  if (req.body.note !== undefined && (typeof req.body.note !== 'string' || req.body.note.length > 1000)) return res.status(400).json({ message: 'Izoh 1000 belgidan oshmasin.' })

  try {
    const attendance = await Attendance.create({
      lesson: lesson._id,
      date: req.body.date,
      entries: result.value,
      note: req.body.note || '',
    })
    emitRealtime(
      req,
      roomsForLessons([lesson], { includeAdmins: false }),
      {
        type: 'attendance:changed',
        lessonId: lesson._id.toString(),
        date: req.body.date,
      },
    )
    res.status(201).json({ id: attendance._id.toString(), message: 'Davomat saqlandi va endi o‘zgartirib bo‘lmaydi.' })
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      return res.status(409).json({ message: 'Bu dars uchun davomat avval olingan va uni o‘zgartirib bo‘lmaydi.' })
    }
    throw error
  }
}

module.exports = { getLessonAttendance, getMyAttendance, listAttendanceStatuses, takeAttendance }
