// One-time, non-destructive backfill for legacy subjects. Run with --apply after reviewing output.
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const Subject = require('../models/Subject')
const Lesson = require('../models/Lesson')
const SubjectLoad = require('../models/SubjectLoad')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 })
  const subjects = await Subject.find().lean()
  const lessons = await Lesson.find({ status: { $ne: 'cancelled' } }).lean()
  for (const subject of subjects) {
    const ownLessons = lessons.filter((lesson) => String(lesson.subject) === String(subject._id))
    const groupIds = [...new Set(ownLessons.flatMap((lesson) => (lesson.groups || []).map(String)))]
    const updates = {}
    const total = Object.values(subject.hours || {}).reduce((sum, value) => sum + Number(value || 0), 0)
    if (!total) { updates.hours = { lecture: 0, practice: 8, lab: 0, independent: 0 }; updates.credits = 8 / 30 }
    if (!subject.groups?.length && groupIds.length) updates.groups = groupIds
    if (!Object.keys(updates).length) continue
    const totals = new Map()
    for (const lesson of ownLessons) for (const group of lesson.groups || []) {
      const key = `${group}:${lesson.type || 'lecture'}`
      totals.set(key, (totals.get(key) || 0) + (lesson.academicHours || 2))
    }
    console.log(JSON.stringify({ subject: subject.name, groups: groupIds.length, fillHours: Boolean(updates.hours), overEightHours: [...totals.values()].filter((v) => v > 8).length }))
    if (process.argv.includes('--apply')) {
      await Subject.updateOne({ _id: subject._id }, { $set: updates })
      for (const [key, plannedHours] of totals) {
        const [group, type] = key.split(':')
        await SubjectLoad.updateOne({ subject: subject._id, group, type }, { $set: { plannedHours }, $setOnInsert: { completedHours: 0 } }, { upsert: true })
      }
    }
  }
  await mongoose.disconnect()
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
