const mongoose = require('mongoose')
const Lesson = require('../models/Lesson')
const SubjectLoad = require('../models/SubjectLoad')
const Group = require('../models/Group')
const TYPE_NAMES = { lecture: 'Ma’ruza', practice: 'Amaliyot', lab: 'Laboratoriya' }

const ACADEMIC_HOUR_MINUTES = 40
const PAIR_DURATION_MINUTES = 80
const ACADEMIC_HOURS_PER_PAIR = 2
const SEMESTER_WEEKS = 15
const HOURS_PER_CREDIT = 30

function allocatedHours(subject, type) {
  return Number(subject?.hours?.[type] || 0)
}

function canReserveHours({ allocated, planned, academicHours = ACADEMIC_HOURS_PER_PAIR }) {
  return Number.isFinite(allocated) && Number.isFinite(planned) && Number.isFinite(academicHours)
    && allocated >= 0 && planned >= 0 && academicHours > 0 && planned + academicHours <= allocated
}

async function initialPlannedHours({ subjectId, groupId, type, session, excludeLessonId = null }) {
  const filter = { subject: new mongoose.Types.ObjectId(subjectId), groups: new mongoose.Types.ObjectId(groupId), type, status: { $ne: 'cancelled' } }
  if (excludeLessonId) filter._id = { $ne: excludeLessonId }
  const result = await Lesson.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$academicHours', ACADEMIC_HOURS_PER_PAIR] } } } },
  ]).session(session)
  return Number(result[0]?.total || 0)
}

async function ensureLoad({ subjectId, groupId, type, session, excludeLessonId }) {
  let load = await SubjectLoad.findOne({ subject: subjectId, group: groupId, type }).session(session)
  if (load) return load
  const plannedHours = await initialPlannedHours({ subjectId, groupId, type, session, excludeLessonId })
  try {
    load = await SubjectLoad.create([{ subject: subjectId, group: groupId, type, plannedHours }], { session }).then(([item]) => item)
  } catch (error) {
    if (error?.code !== 11000) throw error
    load = await SubjectLoad.findOne({ subject: subjectId, group: groupId, type }).session(session)
  }
  return load
}

async function reserveHours({ subject, groupIds, type, academicHours = ACADEMIC_HOURS_PER_PAIR, session, excludeLessonId = null }) {
  const allocation = allocatedHours(subject, type)
  if (allocation <= 0) {
    const groups = await Group.find({ _id: { $in: groupIds } }).select('name').session(session).lean()
    const names = groups.map((group) => group.name).join(', ') || 'Tanlangan guruh'
    const error = new Error(`${names} — “${subject.name || 'tanlangan fan'}”, ${TYPE_NAMES[type] || 'mashg‘ulot'}: soat ajratilmagan.`)
    error.code = 'SUBJECT_HOURS_EXCEEDED'
    throw error
  }
  const orderedIds = [...groupIds].sort()
  for (const groupId of orderedIds) {
    const load = await ensureLoad({ subjectId: subject._id, groupId, type, session, excludeLessonId })
    if (!canReserveHours({ allocated: allocation, planned: load.plannedHours, academicHours })) {
      const remaining = Math.max(0, allocation - load.plannedHours)
      const group = await Group.findById(groupId).select('name').session(session).lean()
      const error = new Error(`${group?.name || 'Tanlangan guruh'} — “${subject.name || 'tanlangan fan'}”, ${TYPE_NAMES[type] || 'mashg‘ulot'}: ${remaining} akademik soat qoldi. Yangi dars uchun ${academicHours} soat kerak.`)
      error.code = 'SUBJECT_HOURS_EXCEEDED'
      throw error
    }
    load.plannedHours += academicHours
    await load.save({ session })
  }
}

async function releaseHours({ subjectId, groupIds, type, academicHours = ACADEMIC_HOURS_PER_PAIR, session }) {
  for (const groupId of [...groupIds].sort()) {
    const load = await ensureLoad({ subjectId, groupId, type, session })
    load.plannedHours = Math.max(0, load.plannedHours - academicHours)
    await load.save({ session })
  }
}

async function loadSummary({ subject, groupIds }) {
  const records = await Lesson.aggregate([
    { $match: { subject: subject._id, groups: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $ne: 'cancelled' } } },
    { $unwind: '$groups' },
    { $match: { groups: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: { group: '$groups', type: '$type' }, plannedHours: { $sum: { $ifNull: ['$academicHours', ACADEMIC_HOURS_PER_PAIR] } }, completedHours: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$academicHours', ACADEMIC_HOURS_PER_PAIR] }, 0] } } } },
    { $project: { group: '$_id.group', type: '$_id.type', plannedHours: 1, completedHours: 1 } },
  ])
  return groupIds.map((groupId) => ({
    groupId: String(groupId),
    types: ['lecture', 'practice', 'lab'].map((type) => {
      const record = records.find((item) => String(item.group) === String(groupId) && item.type === type)
      const allocated = allocatedHours(subject, type)
      const planned = Number(record?.plannedHours || 0)
      return { type, allocated, planned, remaining: Math.max(0, allocated - planned), completed: Number(record?.completedHours || 0) }
    }),
  }))
}

module.exports = { ACADEMIC_HOUR_MINUTES, PAIR_DURATION_MINUTES, ACADEMIC_HOURS_PER_PAIR, SEMESTER_WEEKS, HOURS_PER_CREDIT, canReserveHours, reserveHours, releaseHours, loadSummary }
