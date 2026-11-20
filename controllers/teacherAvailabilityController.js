const mongoose = require('mongoose')
const Lesson = require('../models/Lesson')
const TeacherAvailability = require('../models/TeacherAvailability')
const { getWeekStart } = require('../utils/week')
const { emitRealtime } = require('../utils/realtimeEvents')

function publicAvailability(slot) {
  return {
    id: slot._id.toString(),
    teacher: {
      id: slot.teacher._id.toString(),
      name: slot.teacher.name,
      email: slot.teacher.email,
    },
    dayOfWeek: slot.dayOfWeek,
    period: slot.period,
    weekStart: slot.weekStart,
  }
}

async function listTeacherAvailability(req, res) {
  const filter = {}

  if (req.user.role === 'teacher') {
    filter.teacher = req.user._id
  } else if (req.query.teacherIds !== undefined) {
    const teacherIds = typeof req.query.teacherIds === 'string'
      ? req.query.teacherIds.split(',').filter(Boolean)
      : []
    if (
      !teacherIds.length ||
      teacherIds.length > 15 ||
      teacherIds.some((teacherId) => !mongoose.isValidObjectId(teacherId))
    ) {
      return res.status(400).json({ message: 'Eng ko‘pi bilan 15 ta to‘g‘ri o‘qituvchi identifikatorini yuboring.' })
    }
    filter.teacher = { $in: teacherIds }
  }

  if (req.query.weekStart !== undefined) {
    const weekStart = typeof req.query.weekStart === 'string' && req.query.weekStart
      ? getWeekStart(req.query.weekStart)
      : null
    if (!weekStart) {
      return res.status(400).json({ message: 'Hafta sanasi YYYY-MM-DD formatida bo‘lishi kerak.' })
    }
    filter.weekStart = weekStart
  }

  const slots = await TeacherAvailability.find(filter)
    .sort({ dayOfWeek: 1, period: 1 })
    .populate('teacher', 'name email')
    .lean()
  res.json(slots.map(publicAvailability))
}

async function createTeacherAvailability(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const dayOfWeek = Number(body.dayOfWeek)
  const period = Number(body.period)
  const weekStart = typeof body.weekStart === 'string' && body.weekStart
    ? getWeekStart(body.weekStart)
    : null

  if (
    !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6 ||
    !Number.isInteger(period) || period < 1 || period > 8 ||
    !weekStart
  ) {
    return res.status(400).json({ message: 'Hafta, hafta kuni va para ma’lumotlarini tekshiring.' })
  }

  const lesson = await Lesson.exists({
    teacher: req.user._id,
    weekStart,
    dayOfWeek,
    period,
  })
  if (lesson) {
    return res.status(409).json({ message: 'Bu vaqtda jadvalingizda dars bor, uni band qilib bo‘lmaydi.' })
  }

  try {
    const slot = await TeacherAvailability.create({
      teacher: req.user._id,
      weekStart,
      dayOfWeek,
      period,
    })
    const populatedSlot = await TeacherAvailability.findById(slot._id)
      .populate('teacher', 'name email')
      .lean()
    emitRealtime(
      req,
      [`user:${req.user._id.toString()}`, 'role:admin'],
      {
        type: 'teacher-availability:changed',
        teacherId: req.user._id.toString(),
        weekStart,
      },
    )
    res.status(201).json(publicAvailability(populatedSlot))
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'Bu para allaqachon band qilib qo‘yilgan.' })
    }
    throw error
  }
}

async function deleteTeacherAvailability(req, res) {
  const slot = await TeacherAvailability.findOneAndDelete({
    _id: req.params.id,
    teacher: req.user._id,
  })
  if (!slot) return res.status(404).json({ message: 'Band vaqt topilmadi.' })
  emitRealtime(
    req,
    [`user:${slot.teacher.toString()}`, 'role:admin'],
    {
      type: 'teacher-availability:changed',
      teacherId: slot.teacher.toString(),
      weekStart: slot.weekStart,
    },
  )
  res.status(204).end()
}

module.exports = {
  createTeacherAvailability,
  deleteTeacherAvailability,
  listTeacherAvailability,
}
