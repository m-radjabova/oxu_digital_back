const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const Attendance = require('../models/Attendance')
const Group = require('../models/Group')
const Lesson = require('../models/Lesson')
const Subject = require('../models/Subject')
const Direction = require('../models/Direction')
const TeacherAvailability = require('../models/TeacherAvailability')
const TelegramLinkCode = require('../models/TelegramLinkCode')
const User = require('../models/User')
const { publicUser } = require('./authController')
const { parsePagination } = require('../utils/pagination')
const { resolveDirectionScope } = require('../utils/academicStructure')
const { disconnectRealtimeUser } = require('../utils/realtimeEvents')

const MANAGED_ROLES = ['teacher', 'student']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function findManagedUser(id) {
  const user = await User.findById(id)
  return user && MANAGED_ROLES.includes(user.role) ? user : null
}

async function removeTeacherSchedule(teacherId) {
  const lessons = await Lesson.find({ teacher: teacherId }).select('_id').lean()
  if (lessons.length) {
    await Attendance.deleteMany({ lesson: { $in: lessons.map(({ _id }) => _id) } })
  }
  await Lesson.deleteMany({ teacher: teacherId })
  await TeacherAvailability.deleteMany({ teacher: teacherId })
}

// O‘qituvchi o‘tadigan fanlarning yagona manbasi — administrator hisobda biriktirgan `subjects`.
// Oldingi jadval darslari ruxsatlar ro‘yxatini o‘zboshimchalik bilan kengaytirmaydi.
async function buildTeacherSubjectMap(users) {
  const teachers = users.filter((user) => user.role === 'teacher')
  if (!teachers.length) return new Map()
  const map = new Map()
  for (const teacher of teachers) {
    const teacherId = teacher._id.toString()
    map.set(teacherId, new Set((teacher.subjects || []).map((subjectId) => subjectId.toString())))
  }
  return map
}

function publicUserWithSubjects(user, subjectMap) {
  const base = publicUser(user)
  if (user.role !== 'teacher') return base
  const subjectIds = subjectMap.get(user._id.toString())
  const directionIds = (user.directions || []).map((direction) =>
    direction._id ? direction._id.toString() : direction.toString(),
  )
  return { ...base, subjectIds: subjectIds ? Array.from(subjectIds) : [], directionIds }
}

// Hisob yaratishda tanlangan fanlar ro‘yxatini tekshiradi.
async function resolveSubjectIds(rawSubjectIds) {
  if (rawSubjectIds === undefined || rawSubjectIds === null) return { subjectIds: [] }
  if (!Array.isArray(rawSubjectIds)) return { error: 'subjectIds massiv bo‘lishi kerak.' }

  const uniqueIds = [...new Set(rawSubjectIds.map((subjectId) => String(subjectId)))]
  if (uniqueIds.some((subjectId) => !mongoose.isValidObjectId(subjectId))) {
    return { error: 'Tanlangan fanlardan biri noto‘g‘ri.' }
  }
  if (!uniqueIds.length) return { subjectIds: [] }

  const found = await Subject.countDocuments({ _id: { $in: uniqueIds } })
  if (found !== uniqueIds.length) return { error: 'Tanlangan fanlardan biri topilmadi.' }
  return { subjectIds: uniqueIds }
}

async function resolveTeacherDirectionIds(rawDirectionIds) {
  if (rawDirectionIds === undefined || rawDirectionIds === null) return { directionIds: [] }
  if (!Array.isArray(rawDirectionIds)) return { error: 'directionIds massiv bo‘lishi kerak.' }

  const uniqueIds = [...new Set(rawDirectionIds.map((directionId) => String(directionId)))]
  if (uniqueIds.some((directionId) => !mongoose.isValidObjectId(directionId))) {
    return { error: 'Tanlangan yo‘nalishlardan biri noto‘g‘ri.' }
  }
  if (!uniqueIds.length) return { directionIds: [] }

  const found = await Direction.countDocuments({ _id: { $in: uniqueIds }, isActive: { $ne: false } })
  if (found !== uniqueIds.length) return { error: 'Tanlangan yo‘nalishlardan biri faol emas yoki topilmadi.' }
  return { directionIds: uniqueIds }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Jadval statistikasi uchun: filtrlardan qat’i nazar barcha boshqariladigan hisoblar soni
async function countManagedUsers() {
  const rows = await User.aggregate([
    { $match: { role: { $in: MANAGED_ROLES } } },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        inactive: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
      },
    },
  ])
  const counts = { total: 0, teachers: 0, students: 0, inactive: 0 }
  for (const row of rows) {
    counts.total += row.count
    counts.inactive += row.inactive
    if (row._id === 'teacher') counts.teachers = row.count
    if (row._id === 'student') counts.students = row.count
  }
  return counts
}

async function listUsers(req, res) {
  const role = ['teacher', 'student'].includes(req.query.role) ? req.query.role : undefined
  const filter = role ? { role } : { role: { $in: ['teacher', 'student'] } }
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : ''
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i')
    filter.$or = [{ name: pattern }, { email: pattern }]
  }
  const structureScope = await resolveDirectionScope(req.query)
  if (structureScope?.error) return res.status(400).json({ message: structureScope.error })
  if (structureScope) {
    if (role === 'student') {
      return res.status(400).json({ message: 'Fakultet va yo‘nalish filtrlari faqat o‘qituvchilar uchun ishlaydi.' })
    }
    filter.role = 'teacher'
    filter.directions = { $in: structureScope.directionIds }
  }

  if (req.query.page !== undefined || req.query.limit !== undefined) {
    const { page, limit } = parsePagination(req.query)
    const counts = await countManagedUsers()
    if (structureScope && !structureScope.directionIds.length) {
      return res.json({ items: [], page, limit, total: 0, totalPages: 0, counts })
    }
    const total = await User.countDocuments(filter)
    const totalPages = Math.ceil(total / limit)
    const users = await User.find(filter)
      .populate('group', 'name')
      .populate('directions', 'name department')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
    const subjectMap = await buildTeacherSubjectMap(users)
    return res.json({
      items: users.map((user) => publicUserWithSubjects(user, subjectMap)),
      page,
      limit,
      total,
      totalPages,
      counts,
    })
  }

  if (structureScope && !structureScope.directionIds.length) return res.json([])
  const users = await User.find(filter).populate('group', 'name').sort({ name: 1 })
  await User.populate(users, { path: 'directions', select: 'name department' })
  const subjectMap = await buildTeacherSubjectMap(users)
  res.json(users.map((user) => publicUserWithSubjects(user, subjectMap)))
}

async function createUser(req, res) {
  const { name, email, password, role, groupId, subjectIds, directionIds } = req.body || {}
  if (
    typeof name !== 'string' || !name.trim() ||
    typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' || password.length < 8 ||
    !['teacher', 'student'].includes(role)
  ) {
    return res.status(400).json({
      message: 'Ism, to‘g‘ri email, kamida 8 belgili parol va teacher/student roli kerak.',
    })
  }

  let group = null
  if (role === 'student') {
    if (!groupId || !(group = await Group.findById(groupId))) {
      return res.status(400).json({ message: 'Talaba uchun mavjud guruhni tanlang.' })
    }
    if (group.isActive === false) {
      return res.status(400).json({ message: 'Nofaol guruhga talaba biriktirib bo‘lmaydi. Avval guruhni faollashtiring.' })
    }
  }

  // Fanlar faqat o‘qituvchi uchun saqlanadi (bir nechta fan tanlanishi mumkin).
  let subjects = []
  let directions = []
  if (role === 'teacher') {
    const subjectResult = await resolveSubjectIds(subjectIds)
    if (subjectResult.error) return res.status(400).json({ message: subjectResult.error })
    subjects = subjectResult.subjectIds
    const directionResult = await resolveTeacherDirectionIds(directionIds)
    if (directionResult.error) return res.status(400).json({ message: directionResult.error })
    directions = directionResult.directionIds
    if (!directions.length) {
      return res.status(400).json({ message: 'O‘qituvchiga kamida bitta yo‘nalish biriktiring.' })
    }
  }

  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: await bcrypt.hash(password, 12),
    role,
    group: group?._id || null,
    subjects,
    directions,
  })
  await user.populate('group', 'name')
  await user.populate('directions', 'name department')
  res.status(201).json(publicUserWithSubjects(user, new Map()))
}

async function updateUser(req, res) {
  const user = await findManagedUser(req.params.id)
  if (!user) return res.status(404).json({ message: 'Hisob topilmadi.' })
  const previousRole = user.role
  const previousGroupId = user.group?.toString() || ''

  const { name, email, password, role, groupId, subjectIds, directionIds } = req.body || {}
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const hasNewPassword = typeof password === 'string' && password.length > 0

  if (
    !trimmedName || trimmedName.length > 100 ||
    !EMAIL_PATTERN.test(normalizedEmail) ||
    !MANAGED_ROLES.includes(role) ||
    (hasNewPassword && password.length < 8)
  ) {
    return res.status(400).json({
      message: 'Ism, to‘g‘ri email va teacher/student rolini kiriting. Yangi parol kiritilsa kamida 8 belgidan iborat bo‘lsin.',
    })
  }

  let group = null
  if (role === 'student') {
    if (!groupId || !(group = await Group.findById(groupId))) {
      return res.status(400).json({ message: 'Talaba uchun mavjud guruhni tanlang.' })
    }
    const currentGroupId = user.group ? user.group.toString() : ''
    if (group.isActive === false && group._id.toString() !== currentGroupId) {
      return res.status(400).json({ message: 'Nofaol guruhni tanlab bo‘lmaydi. Avval guruhni faollashtiring.' })
    }
  }

  if (await User.exists({ email: normalizedEmail, _id: { $ne: user._id } })) {
    return res.status(409).json({ message: 'Bu email boshqa hisobga biriktirilgan.' })
  }

  // O‘qituvchi fanlari yangilanadi; talabaga o‘tkazilsa ro‘yxat tozalanadi.
  let subjects = null
  let directions = null
  if (role === 'teacher' && subjectIds !== undefined) {
    const subjectResult = await resolveSubjectIds(subjectIds)
    if (subjectResult.error) return res.status(400).json({ message: subjectResult.error })
    subjects = subjectResult.subjectIds
  }
  if (role === 'teacher' && directionIds !== undefined) {
    const directionResult = await resolveTeacherDirectionIds(directionIds)
    if (directionResult.error) return res.status(400).json({ message: directionResult.error })
    directions = directionResult.directionIds
  }
  if (role === 'teacher' && !(directions || user.directions || []).length) {
    return res.status(400).json({ message: 'O‘qituvchiga kamida bitta yo‘nalish biriktiring.' })
  }

  // Rol o‘zgarsa, o‘qituvchiga tegishli jadval ma’lumotlari yangi rolga mos bo‘lmay qoladi.
  if (user.role === 'teacher' && role !== 'teacher') {
    await removeTeacherSchedule(user._id)
    await TelegramLinkCode.deleteMany({ user: user._id })
  }

  user.name = trimmedName
  user.email = normalizedEmail
  user.role = role
  user.group = group ? group._id : null
  user.subjects = role === 'teacher' ? (subjects || user.subjects || []) : []
  user.directions = role === 'teacher' ? (directions || user.directions || []) : []
  if (hasNewPassword) user.password = await bcrypt.hash(password, 12)
  await user.save()
  if (previousRole !== user.role || previousGroupId !== (user.group?.toString() || '')) {
    disconnectRealtimeUser(req, user._id)
  }
  await user.populate('group', 'name')
  await user.populate('directions', 'name department')
  res.json(publicUserWithSubjects(user, new Map()))
}

async function setUserStatus(req, res) {
  const user = await findManagedUser(req.params.id)
  if (!user) return res.status(404).json({ message: 'Hisob topilmadi.' })

  const { isActive } = req.body || {}
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive qiymati true yoki false bo‘lishi kerak.' })
  }

  // Hisob o‘chirilmaydi — faqat faol/nofaol holati almashtiriladi, ma’lumotlar saqlanadi.
  user.isActive = isActive
  await user.save()
  if (!isActive) disconnectRealtimeUser(req, user._id)
  await user.populate('group', 'name')
  res.json(publicUser(user))
}

module.exports = { listUsers, createUser, updateUser, setUserStatus }
