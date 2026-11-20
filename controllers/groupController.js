const mongoose = require('mongoose')
const Group = require('../models/Group')
const Direction = require('../models/Direction')
const User = require('../models/User')
const Subject = require('../models/Subject')

async function parseGroupInput(body) {
  const { name, year, directionId, educationForm, admissionYear, studentLimit, isActive } = body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Guruh nomini kiriting.' }
  }

  const parsedYear = Number(year || 1)
  if (!Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > 6) {
    return { error: 'Kurs 1 dan 6 gacha bo‘lishi kerak.' }
  }

  if (!mongoose.isValidObjectId(directionId)) {
    return { error: 'Guruh uchun yo‘nalish tanlang.' }
  }
  const direction = await Direction.findById(directionId).select('_id isActive')
  if (!direction || direction.isActive === false) {
    return { error: 'Faol yo‘nalishni tanlang.' }
  }

  if (educationForm !== undefined && !['full-time', 'evening', 'part-time'].includes(educationForm)) return { error: 'Ta’lim shakli noto‘g‘ri.' }
  if (admissionYear !== undefined && (!Number.isInteger(Number(admissionYear)) || Number(admissionYear) < 1900 || Number(admissionYear) > 2100)) return { error: 'Qabul yilini tekshiring.' }
  if (studentLimit !== undefined && (!Number.isInteger(Number(studentLimit)) || Number(studentLimit) < 1 || Number(studentLimit) > 500)) return { error: 'Talaba limiti 1 dan 500 gacha bo‘lishi kerak.' }
  if (isActive !== undefined && typeof isActive !== 'boolean') return { error: 'Guruh holati noto‘g‘ri.' }
  const value = { name: name.trim(), year: parsedYear, direction: direction._id }
  if (educationForm !== undefined) value.educationForm = educationForm
  if (admissionYear !== undefined) value.admissionYear = Number(admissionYear)
  if (studentLimit !== undefined) value.studentLimit = Number(studentLimit)
  if (isActive !== undefined) value.isActive = isActive
  return { value }
}

async function listGroups(_req, res) {
  const groups = await Group.find()
    .populate({ path: 'direction', select: 'name department', populate: { path: 'department', select: 'name faculty', populate: { path: 'faculty', select: 'name' } } })
    .sort({ name: 1 })
  const counts = await User.aggregate([{ $match: { role: 'student', isActive: { $ne: false }, group: { $ne: null } } }, { $group: { _id: '$group', count: { $sum: 1 } } }])
  const byGroup = new Map(counts.map((item) => [String(item._id), item.count]))
  res.json(groups.map((group) => ({ ...group.toJSON(), studentCount: byGroup.get(String(group._id)) || 0 })))
}

async function createGroup(req, res) {
  const result = await parseGroupInput(req.body)
  if (result.error) return res.status(400).json({ message: result.error })
  if (await Group.exists({ name: result.value.name })) {
    return res.status(409).json({ message: 'Bu nomdagi guruh allaqachon mavjud.' })
  }

  const group = await Group.create(result.value)
  await group.populate({ path: 'direction', select: 'name department', populate: { path: 'department', select: 'name faculty', populate: { path: 'faculty', select: 'name' } } })
  res.status(201).json(group)
}

async function updateGroup(req, res) {
  const group = await Group.findById(req.params.id)
  if (!group) return res.status(404).json({ message: 'Guruh topilmadi.' })

  const result = await parseGroupInput(req.body)
  if (result.error) return res.status(400).json({ message: result.error })

  if (await Group.exists({ name: result.value.name, _id: { $ne: group._id } })) {
    return res.status(409).json({ message: 'Bu nomdagi guruh allaqachon mavjud.' })
  }

  group.name = result.value.name
  group.year = result.value.year
  group.direction = result.value.direction
  for (const key of ['educationForm', 'admissionYear', 'studentLimit', 'isActive']) if (result.value[key] !== undefined) group[key] = result.value[key]
  await group.save()
  await group.populate({ path: 'direction', select: 'name department', populate: { path: 'department', select: 'name faculty', populate: { path: 'faculty', select: 'name' } } })
  res.json(group)
}

async function setGroupStatus(req, res) {
  const group = await Group.findById(req.params.id)
  if (!group) return res.status(404).json({ message: 'Guruh topilmadi.' })

  const { isActive } = req.body || {}
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive qiymati true yoki false bo‘lishi kerak.' })
  }

  // Guruh o‘chirilmaydi — faqat faol/nofaol holati almashtiriladi, darslar va talabalar saqlanadi.
  group.isActive = isActive
  await group.save()
  res.json(group)
}

async function addGroupSubjects(req, res) {
  const group = await Group.findById(req.params.id)
  if (!group) return res.status(404).json({ message: 'Guruh topilmadi.' })
  if (!group.isActive) return res.status(400).json({ message: 'Fan biriktirish uchun guruh faol bo‘lishi kerak.' })
  const ids = req.body?.subjectIds
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Bir yoki bir nechta fanni tanlang.' })
  const uniqueIds = [...new Set(ids.map(String))]
  const subjects = await Subject.find({ _id: { $in: uniqueIds } }).select('_id course semester direction educationForm groups')
  if (subjects.length !== uniqueIds.length || subjects.some((subject) => subject.course !== group.year || subject.semester !== 1 || (subject.direction && String(subject.direction) !== String(group.direction)) || subject.educationForm !== group.educationForm)) {
    return res.status(400).json({ message: 'Faqat guruh kursi, yo‘nalishi va ta’lim shakliga mos 1-semestr fanlarini tanlang.' })
  }
  if (subjects.some((subject) => subject.groups.length >= 100 && !subject.groups.some((id) => String(id) === String(group._id)))) return res.status(400).json({ message: 'Tanlangan fanlardan biriga 100 ta guruh biriktirilgan.' })
  await Subject.updateMany({ _id: { $in: uniqueIds } }, { $addToSet: { groups: group._id } })
  res.json({ count: uniqueIds.length, message: 'Fanlar guruhga biriktirildi.' })
}

module.exports = { listGroups, createGroup, updateGroup, setGroupStatus, addGroupSubjects }
