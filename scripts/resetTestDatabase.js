// Destructive reset of the configured MongoDB database; preserves administrator accounts.
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const Faculty = require('../models/Faculty')
const Department = require('../models/Department')
const Direction = require('../models/Direction')
const Group = require('../models/Group')
const Subject = require('../models/Subject')
const User = require('../models/User')
const Building = require('../models/Building')
const Room = require('../models/Room')
const Lesson = require('../models/Lesson')
const Attendance = require('../models/Attendance')
const SubjectLoad = require('../models/SubjectLoad')
const { addDays, getTodayDateKey, getWeekStart } = require('../utils/week')

const names = ['Aziza Karimova', 'Jasur Abduvaliyev', 'Dilnoza Rahimova', 'Sardor Ismoilov', 'Malika Tursunova', 'Bekzod Aliyev', 'Madina Qodirova', 'Sherzod Rasulov', 'Nodira Xolmatova', 'Umidjon Sobirov']
const subjectSpecs = [
  ['Dasturlash asoslari', 'DA101', 0], ['Algoritmlar', 'AL101', 0], ['Web dasturlash', 'WD101', 0], ['Ma’lumotlar bazasi', 'MB101', 0],
  ['Axborot tizimlari', 'AT101', 1], ['Kompyuter tarmoqlari', 'KT101', 1], ['Axborot xavfsizligi', 'AX101', 1],
  ['Matematika', 'MA101', 2], ['Statistika', 'ST101', 2], ['Fizika', 'FI101', 2],
]
const id = () => new mongoose.Types.ObjectId()

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Ishga tushirish uchun --apply talab qilinadi.')
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL
  const password = process.env.SEED_PASSWORD
  if (!uri || !password || password.length < 8) throw new Error('MongoDB URL va kamida 8 belgili SEED_PASSWORD talab qilinadi.')
  const hash = await bcrypt.hash(password, 12)
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  const admins = await db.collection('users').countDocuments({ role: 'admin' })
  if (!admins) throw new Error('Admin akkaunti topilmadi. Kirishni yo‘qotmaslik uchun reset to‘xtatildi.')
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name).filter((name) => !name.startsWith('system.'))
  const faculty = { _id: id(), name: 'Ijtimoiy fanlar va texnika fakulteti' }
  const departments = [{ _id: id(), name: 'Dasturiy injiniring kafedrasi', faculty: faculty._id }, { _id: id(), name: 'Matematika va tabiiy fanlar kafedrasi', faculty: faculty._id }]
  const directions = [
    { _id: id(), name: 'Kompyuter ilmlari va dasturlash texnologiyalari', department: departments[0]._id },
    { _id: id(), name: 'Axborot tizimlari va texnologiyalari', department: departments[0]._id },
    { _id: id(), name: 'Amaliy matematika', department: departments[1]._id },
  ]
  const groups = Array.from({ length: 6 }, (_, i) => ({ _id: id(), name: `DEMO-G${String(i + 1).padStart(2, '0')}`, year: 1, direction: directions[Math.floor(i / 2)]._id, studentLimit: 30 }))
  const subjects = subjectSpecs.map(([name, code, directionIndex], i) => ({ _id: id(), name, code, color: ['#6658d3', '#3186c8', '#2b9b78', '#d98642', '#bd5a77'][i % 5], direction: directions[directionIndex]._id, course: 1, semester: 1, hours: { lecture: 2, practice: 4, lab: 2, independent: 0 }, credits: 8 / 30, groups: groups.slice(directionIndex * 2, directionIndex * 2 + 2).map((g) => g._id) }))
  const teachers = names.map((name, i) => ({ _id: id(), name, email: `teacher${String(i + 1).padStart(2, '0')}@gmail.com`, password: hash, role: 'teacher', directions: [subjects[i].direction], subjects: [subjects[i]._id], isDemoAccount: true }))
  const students = []
  const sizes = [3, 3, 3, 2, 2, 2]
  let studentNo = 0
  for (let i = 0; i < groups.length; i++) for (let j = 0; j < sizes[i]; j++) {
    studentNo++
    students.push({ _id: id(), name: `Talaba ${String(studentNo).padStart(2, '0')}`, email: `student${String(studentNo).padStart(2, '0')}@gmail.com`, password: hash, role: 'student', group: groups[i]._id, isDemoAccount: true })
  }
  const building = { _id: id(), name: '1-bino', address: 'OXU kampusi' }
  const rooms = Array.from({ length: 6 }, (_, i) => ({ _id: id(), building: building._id, number: String(101 + i), floor: 1, capacity: 30, kind: 'multi' }))
  const lastWeek = addDays(getWeekStart(getTodayDateKey()), -7)
  const lessons = [], attendance = [], loads = []
  for (let i = 0; i < groups.length; i++) {
    const subjectIndex = [0, 0, 4, 4, 7, 7][i]
    for (const [j, type] of ['lecture', 'practice'].entries()) {
      const lesson = { _id: id(), groups: [groups[i]._id], subject: subjects[subjectIndex]._id, teacher: teachers[subjectIndex]._id, roomId: rooms[i]._id, room: `1-bino, ${rooms[i].number}-xona`, dayOfWeek: i + 1, period: j + 1, weekStart: lastWeek, type, academicHours: 2, durationMinutes: 80, status: 'completed' }
      lessons.push(lesson)
      attendance.push({ lesson: lesson._id, date: addDays(lastWeek, i), note: 'Sinov davomat ma’lumoti', entries: students.filter((student) => String(student.group) === String(groups[i]._id)).map((student) => ({ student: student._id, status: j === 0 ? 'absent' : 'present' })) })
      loads.push({ subject: lesson.subject, group: groups[i]._id, type, plannedHours: 2, completedHours: 2 })
    }
  }
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      for (const name of collections) await db.collection(name).deleteMany(name === 'users' ? { role: { $ne: 'admin' } } : {}, { session })
      for (const [Model, docs] of [[Faculty, [faculty]], [Department, departments], [Direction, directions], [Group, groups], [Subject, subjects], [User, [...teachers, ...students]], [Building, [building]], [Room, rooms], [Lesson, lessons], [Attendance, attendance], [SubjectLoad, loads]]) await Model.insertMany(docs, { session })
    }, { maxCommitTimeMS: 30000 })
  } finally { await session.endSession() }
  console.log(JSON.stringify({ adminsPreserved: admins, teachers: teachers.length, students: students.length, groups: groups.length, directions: directions.length, subjects: subjects.length, lessons: lessons.length, attendanceRecords: attendance.length, absentStudents: students.length, pastWeek: lastWeek }))
}
main().catch((error) => { console.error('Reset amalga oshmadi:', error.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
