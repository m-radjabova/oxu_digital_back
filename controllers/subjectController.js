const Subject = require('../models/Subject')
const Group = require('../models/Group')
const Direction = require('../models/Direction')
const Lesson = require('../models/Lesson')
const mongoose = require('mongoose')
const { generateSubjectColor } = require('../utils/subjectColor')
const { loadSummary } = require('../utils/academicLoad')
const { getTodayDateKey, addDays } = require('../utils/week')

const HOURS_PER_CREDIT = 30

async function listSubjects(_req, res) {
  res.json(await Subject.find()
    .populate('groups', 'name year isActive')
    .populate('direction', 'name')
    .sort({ name: 1 }))
}

function normalizeGroupIds(groupIds) {
  if (groupIds === undefined) return []
  if (!Array.isArray(groupIds) || groupIds.length > 100) return null
  const ids = [...new Set(groupIds.map((id) => String(id)))]
  return ids.every((id) => mongoose.isValidObjectId(id)) ? ids : null
}

function nonNegativeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

async function parseSubjectInput(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' ? body : {}
  const { name, color, code, directionId, course, semester, educationForm, block, subjectType, ratingType, description } = input
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Fan nomini kiriting.' }
  }
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { error: 'Fan rangi HEX formatida bo‘lishi kerak.' }
  }
  if (typeof code !== 'string' || !/^[A-Za-z]{2,6}\d{2,6}$/.test(code.trim())) return { error: 'Fan kodini masalan, AT1204 formatida kiriting.' }
  if (description !== undefined && (typeof description !== 'string' || description.trim().length > 500)) return { error: 'Qisqacha tavsif 500 belgidan oshmasligi kerak.' }
  if (directionId && !mongoose.isValidObjectId(directionId)) return { error: 'Yo‘nalish identifikatori noto‘g‘ri.' }
  if (directionId && !await Direction.exists({ _id: directionId, isActive: true })) return { error: 'Faol yo‘nalishni tanlang.' }
  if (!Number.isInteger(Number(course)) || Number(course) < 1 || Number(course) > 6) return { error: 'Kurs 1 dan 6 gacha bo‘lishi kerak.' }
  if (![1, 2].includes(Number(semester))) return { error: 'Semestr 1 yoki 2 bo‘lishi kerak.' }
  if (educationForm !== undefined && !['full-time', 'evening'].includes(educationForm)) return { error: 'Ta’lim shakli noto‘g‘ri.' }
  if (block !== undefined && !['mandatory', 'elective'].includes(block)) return { error: 'Fan bloki noto‘g‘ri.' }
  if (subjectType !== undefined && !['theory', 'theory-practice', 'practice'].includes(subjectType)) return { error: 'Fan turi noto‘g‘ri.' }
  if (ratingType !== undefined && !['100-point', 'credit'].includes(ratingType)) return { error: 'Reyting turi noto‘g‘ri.' }

  const hoursInput = input.hours && typeof input.hours === 'object' ? input.hours : {}
  const hours = {}
  for (const key of ['lecture', 'practice', 'lab', 'independent']) {
    const value = nonNegativeNumber(hoursInput[key], 0)
    if (value === null || value > 2000) return { error: 'Soatlar 0 dan 2000 gacha bo‘lishi kerak.' }
    hours[key] = value
  }
  const totalHours = hours.lecture + hours.practice + hours.lab + hours.independent
  if (!Number.isFinite(totalHours) || totalHours <= 0) return { error: 'Kamida bitta mashg‘ulot soatini kiriting.' }
  // Kredit serverda qayta hisoblanadi — brauzerdan yuborilgan qiymatga ishonilmaydi.
  const credits = totalHours / HOURS_PER_CREDIT
  if (!Number.isFinite(credits) || credits > 60) return { error: 'Hisoblangan kredit 0 dan 60 gacha bo‘lishi kerak.' }
  const groupIds = normalizeGroupIds(input.groupIds)
  if (groupIds === null) return { error: 'Guruhlar ro‘yxatini tekshiring.' }
  if (groupIds.length) {
    const groups = await Group.find({ _id: { $in: groupIds } }).select('_id isActive direction year').lean()
    if (groups.length !== groupIds.length) return { error: 'Tanlangan guruhlardan biri topilmadi.' }
    if (groups.some((group) => group.isActive === false)) return { error: 'Nofaol guruhga fan biriktirib bo‘lmaydi.' }
    if (groups.some((group) => Number(group.year) !== Number(course))) return { error: 'Fan faqat tanlangan kursdagi guruhlarga biriktirilishi mumkin.' }
    if (directionId && groups.some((group) => group.direction?.toString() !== String(directionId))) return { error: 'Fan faqat tanlangan yo‘nalishdagi guruhlarga biriktirilishi mumkin.' }
  }

  const value = {
    name: name.trim(), color, code: code?.trim() || undefined,
    direction: directionId || null, course: course === undefined || course === '' ? null : Number(course),
    semester: semester === undefined || semester === '' ? null : Number(semester),
    educationForm: educationForm || 'full-time',
    block: block || 'mandatory', subjectType: subjectType || 'theory-practice', ratingType: ratingType || '100-point',
    description: description?.trim() || '', hours, credits, groups: groupIds,
  }
  if (partial) delete value.color
  return { value }
}

async function populateSubject(subject) {
  return subject.populate('groups', 'name year isActive').then((item) => item.populate('direction', 'name'))
}

async function createSubject(req, res) {
  const result = await parseSubjectInput(req.body)
  if (result.error) return res.status(400).json({ message: result.error })

  // Rang berilmasa, mavjud fanlar ranglaridan farqli rang avtomatik tanlanadi
  result.value.color = result.value.color || generateSubjectColor(result.value.name, await Subject.distinct('color'))
  const subject = await Subject.create(result.value)
  res.status(201).json(await populateSubject(subject))
}

async function updateSubject(req, res) {
  const subject = await Subject.findById(req.params.id)
  if (!subject) return res.status(404).json({ message: 'Fan topilmadi.' })
  const result = await parseSubjectInput(req.body, { partial: true })
  if (result.error) return res.status(400).json({ message: result.error })
  Object.assign(subject, result.value)
  await subject.save()
  res.json(await populateSubject(subject))
}

async function deleteSubject(req, res) {
  const subject = await Subject.findById(req.params.id)
  if (!subject) return res.status(404).json({ message: 'Fan topilmadi.' })
  if (await Lesson.exists({ subject: subject._id })) {
    return res.status(409).json({ message: 'Bu fan dars jadvalida ishlatilgan. Avval unga tegishli darslarni o‘chiring.' })
  }
  await subject.deleteOne()
  res.status(204).end()
}

async function setSubjectGroups(req, res) {
  const subject = await Subject.findById(req.params.id)
  if (!subject) return res.status(404).json({ message: 'Fan topilmadi.' })
  const groupIds = normalizeGroupIds(req.body?.groupIds)
  if (groupIds === null) return res.status(400).json({ message: 'Guruhlar ro‘yxatini tekshiring.' })
  const groups = await Group.find({ _id: { $in: groupIds } }).select('_id isActive direction year').lean()
  if (groups.length !== groupIds.length || groups.some((group) => group.isActive === false)) return res.status(400).json({ message: 'Faqat mavjud faol guruhlarni tanlang.' })
  if (groups.some((group) => Number(group.year) !== Number(subject.course))) return res.status(400).json({ message: 'Fan faqat o‘z kursidagi guruhlarga biriktirilishi mumkin.' })
  if (subject.direction && groups.some((group) => group.direction?.toString() !== subject.direction.toString())) return res.status(400).json({ message: 'Fan faqat o‘z yo‘nalishidagi guruhlarga biriktirilishi mumkin.' })
  subject.groups = groupIds
  await subject.save()
  res.json(await populateSubject(subject))
}

async function subjectLoadSummary(req, res) {
  const subject = await Subject.findById(req.params.id).select('hours groups')
  if (!subject) return res.status(404).json({ message: 'Fan topilmadi.' })
  const requested = typeof req.query.groupIds === 'string' ? req.query.groupIds.split(',').filter(Boolean) : []
  const groupIds = requested.length ? requested : subject.groups.map(String)
  if (!groupIds.length || groupIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Kamida bitta to‘g‘ri guruh identifikatorini yuboring.' })
  res.json(await loadSummary({ subject, groupIds }))
}

// Jadvaldagi darslardan har bir fan–guruh uchun yuklama hisoblanadi.
async function subjectLoadOverview(req, res) {
  const { parsePagination } = require('../utils/pagination')
  const { page, limit } = parsePagination(req.query, 50)
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
  const directionId = req.query.directionId
  const groupId = req.query.groupId
  if ((directionId && !mongoose.isValidObjectId(directionId)) || (groupId && !mongoose.isValidObjectId(groupId))) return res.status(400).json({ message: 'Yo‘nalish yoki guruh identifikatori noto‘g‘ri.' })
  const status = ['remaining', 'full', 'missing', 'over'].includes(req.query.status) ? req.query.status : 'all'
  const selectedType = ['lecture', 'practice', 'lab'].includes(req.query.type) ? req.query.type : 'all'
  const filters = []
  if (directionId) filters.push({ direction: new mongoose.Types.ObjectId(directionId) })
  if (groupId) filters.push({ 'group._id': new mongoose.Types.ObjectId(groupId) })
  if (query) {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filters.push({ $or: ['name', 'code', 'group.name', 'directionInfo.name'].map((field) => ({ [field]: { $regex: safe, $options: 'i' } })) })
  }
  const pipeline = [
    { $unwind: '$groups' },
    { $lookup: { from: 'groups', localField: 'groups', foreignField: '_id', as: 'group' } },
    { $unwind: '$group' },
    { $lookup: { from: 'directions', localField: 'direction', foreignField: '_id', as: 'directionInfo' } },
    { $unwind: { path: '$directionInfo', preserveNullAndEmptyArrays: true } },
    ...(filters.length ? [{ $match: { $and: filters } }] : []),
    { $lookup: { from: 'lessons', let: { subjectId: '$_id', groupId: '$group._id' }, pipeline: [
      { $match: { status: { $ne: 'cancelled' }, $expr: { $and: [{ $eq: ['$subject', '$$subjectId'] }, { $in: ['$$groupId', { $ifNull: ['$groups', []] }] }] } } },
      { $group: { _id: '$type', planned: { $sum: { $ifNull: ['$academicHours', 2] } }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$academicHours', 2] }, 0] } } } },
    ], as: 'lessonTotals' } },
    { $addFields: { types: { $map: { input: ['lecture', 'practice', 'lab'], as: 'kind', in: { $let: { vars: { record: { $arrayElemAt: [{ $filter: { input: '$lessonTotals', as: 'record', cond: { $eq: ['$$record._id', '$$kind'] } } }, 0] }, allocation: { $switch: { branches: [{ case: { $eq: ['$$kind', 'lecture'] }, then: { $ifNull: ['$hours.lecture', 0] } }, { case: { $eq: ['$$kind', 'practice'] }, then: { $ifNull: ['$hours.practice', 0] } }], default: { $ifNull: ['$hours.lab', 0] } } } }, in: { type: '$$kind', allocated: '$$allocation', planned: { $ifNull: ['$$record.planned', 0] }, completed: { $ifNull: ['$$record.completed', 0] }, remaining: { $max: [0, { $subtract: ['$$allocation', { $ifNull: ['$$record.planned', 0] }] }] } } } } } } } },
    { $addFields: { selectedTypes: selectedType === 'all' ? '$types' : { $filter: { input: '$types', as: 'item', cond: { $eq: ['$$item.type', selectedType] } } } } },
    { $addFields: { allocated: { $sum: '$selectedTypes.allocated' }, planned: { $sum: '$selectedTypes.planned' }, remaining: { $sum: '$selectedTypes.remaining' }, over: { $anyElementTrue: [{ $map: { input: '$selectedTypes', as: 'item', in: { $gt: ['$$item.planned', '$$item.allocated'] } } }] }, bookable: { $anyElementTrue: [{ $map: { input: '$selectedTypes', as: 'item', in: { $gte: ['$$item.remaining', 2] } } }] } } },
    { $addFields: { loadStatus: { $switch: { branches: [
      { case: '$over', then: 'over' },
      { case: { $eq: ['$allocated', 0] }, then: 'missing' },
      { case: { $eq: ['$bookable', false] }, then: 'full' },
    ], default: 'remaining' } } } },
    ...(status === 'all' ? [] : [{ $match: { loadStatus: status } }]),
    { $sort: { name: 1, 'group.name': 1, _id: 1, 'group._id': 1 } },
    { $facet: {
      items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0, subjectId: { $toString: '$_id' }, subject: '$name', code: { $ifNull: ['$code', ''] }, direction: { $ifNull: ['$directionInfo.name', 'Barcha yo‘nalishlar'] }, groupId: { $toString: '$group._id' }, group: '$group.name', groupActive: { $ne: ['$group.isActive', false] }, types: '$selectedTypes', loadStatus: 1, allocated: 1, planned: 1, remaining: 1 } }],
      count: [{ $count: 'total' }],
      stats: [{ $group: { _id: '$loadStatus', count: { $sum: 1 } } }],
    } },
  ]
  const [result] = await Subject.aggregate(pipeline)
  const total = result.count[0]?.total || 0
  const counts = { remaining: 0, full: 0, missing: 0, over: 0 }
  for (const item of result.stats) counts[item._id] = item.count
  res.json({ items: result.items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), counts })
}

// Bir fanga biriktirilgan guruhlarni shu kungacha o'tilgan jadval bo'yicha solishtiramiz.
async function subjectProgressAlerts(_req, res) {
  const subjects = await Subject.find({ 'groups.1': { $exists: true } }).populate('groups', 'name isActive').select('name groups').lean()
  const lessons = await Lesson.find({ subject: { $in: subjects.map((item) => item._id) }, status: { $ne: 'cancelled' } }).select('subject groups weekStart dayOfWeek academicHours').lean()
  const today = getTodayDateKey()
  const totals = new Map()
  for (const lesson of lessons) {
    if (!lesson.weekStart || addDays(lesson.weekStart, lesson.dayOfWeek - 1) >= today) continue
    for (const group of lesson.groups || []) {
      const key = `${lesson.subject}:${group}`
      totals.set(key, (totals.get(key) || 0) + (lesson.academicHours || 2))
    }
  }
  const alerts = []
  for (const subject of subjects) {
    const groups = subject.groups.filter((group) => group.isActive !== false)
    const maximum = Math.max(0, ...groups.map((group) => totals.get(`${subject._id}:${group._id}`) || 0))
    for (const group of groups) {
      const hours = totals.get(`${subject._id}:${group._id}`) || 0
      if (maximum - hours >= 2) alerts.push({ subject: subject.name, group: group.name, hours, maximum })
    }
  }
  res.json(alerts)
}

module.exports = { listSubjects, createSubject, updateSubject, deleteSubject, setSubjectGroups, subjectLoadSummary, subjectProgressAlerts, subjectLoadOverview }
