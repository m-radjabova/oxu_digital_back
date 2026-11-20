const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const Building = require('./models/Building')
const Department = require('./models/Department')
const Direction = require('./models/Direction')
const Faculty = require('./models/Faculty')
const Group = require('./models/Group')
const Lesson = require('./models/Lesson')
const Room = require('./models/Room')
const Subject = require('./models/Subject')
const User = require('./models/User')
const { buildDemoAssignments } = require('./utils/demoSchedule')
const { buildDemoAccountSpecs, buildDemoLessonCleanupFilter } = require('./utils/demoSeed')
const { ensureLessonWeeks } = require('./utils/lessonWeeks')
const { addDays } = require('./utils/week')
const { formatRoomName, normalizeRoomKey } = require('./utils/room')

const TEACHERS = [
  'Aziza Karimova', 'Jasur Abduvaliyev', 'Dilnoza Raximova', 'Sardor Ismoilov',
  'Malika Tursunova', 'Bekzod Aliyev', 'Madina Qodirova', 'Sherzod Rasulov',
  'Nodira Xolmatova', 'Umidjon Sobirov',
]
const SUBJECTS = [
  'Matematika', 'Ingliz tili', 'Dasturlash', 'Fizika', 'Ma’lumotlar bazasi',
  'Web dasturlash', 'Algoritmlar', 'Akademik yozuv', 'Kompyuter tarmoqlari', 'Statistika',
]
const EMAIL_DOMAIN = 'gmail.com'
const LEGACY_EMAIL_DOMAIN = 'demo.oxu.uz'
const GROUP_NAMES = Array.from({ length: 10 }, (_value, index) => `DEMO-G${String(index + 1).padStart(2, '0')}`)
const STUDENTS_PER_GROUP = 5
const FACULTY_NAME = 'Ijtimoiy fanlar va texnika fakulteti'
const DEPARTMENT_SPECS = [
  {
    name: 'Dasturiy injiniring kafedrasi',
    directions: [
      'Kompyuter ilmlari va dasturlash texnologiyalari',
      'Axborot tizimlari va texnologiyalari',
    ],
  },
  {
    name: 'Matematika va tabiiy fanlar kafedrasi',
    directions: ['Amaliy matematika'],
  },
]
const DEMO_BUILDINGS = [
  {
    name: '4-bino',
    address: 'OXU kampusi',
    rooms: Array.from({ length: 20 }, (_value, index) => {
      const number = 701 + index
      return {
        number: String(number),
        floor: Math.floor(number / 100),
        capacity: number >= 711 && number <= 716 ? 24 : number >= 717 ? 120 : 36,
        kind: number >= 711 && number <= 716
          ? 'laboratory'
          : number >= 717
            ? 'lecture'
            : 'classroom',
      }
    }),
  },
  {
    name: '1-bino',
    address: 'OXU kampusi',
    rooms: ['M-1', 'M-2', 'M-3', 'M-4'].map((number, index) => ({
      number,
      floor: index < 2 ? 1 : 2,
      capacity: 180,
      kind: 'lecture',
    })),
  },
]
const resetDemo = process.argv.slice(2).includes('--reset-demo')

function demoRoomCanHost(room, type) {
  return room.kind === 'multi' || (type === 'lab'
    ? room.kind === 'laboratory'
    : room.kind !== 'laboratory')
}

async function seedDemoBuildings() {
  const buildings = await Promise.all(DEMO_BUILDINGS.map(({ name, address }) =>
    Building.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, address, isActive: true } },
      { upsert: true, new: true, runValidators: true },
    ),
  ))
  const rooms = await Promise.all(DEMO_BUILDINGS.flatMap((spec, index) =>
    spec.rooms.map((room) =>
      Room.findOneAndUpdate(
        { building: buildings[index]._id, number: room.number },
        { $setOnInsert: { building: buildings[index]._id, ...room, isActive: true } },
        { upsert: true, new: true, runValidators: true },
      ),
    ),
  ))
  return Room.populate(rooms, { path: 'building', select: 'name' })
}

async function attachDemoRooms(existingLessons, groups, rooms) {
  const demoGroupIds = new Set(groups.map((group) => group._id.toString()))
  const demoLessons = existingLessons.filter((lesson) =>
    lesson.groups.length > 0 && lesson.groups.every((groupId) => demoGroupIds.has(groupId.toString())),
  )
  const demoLessonIds = new Set(demoLessons.map((lesson) => lesson._id.toString()))
  const roomIdByKey = new Map(rooms.map((room) => [
    normalizeRoomKey(formatRoomName(room.building.name, room.number)),
    room._id.toString(),
  ]))
  const occupied = new Set()
  for (const lesson of existingLessons) {
    if (demoLessonIds.has(lesson._id.toString())) continue
    const roomId = lesson.roomId?.toString() || roomIdByKey.get(normalizeRoomKey(lesson.room || ''))
    if (roomId) occupied.add(`${roomId}:${lesson.weekStart}:${lesson.dayOfWeek}:${lesson.period}`)
  }
  const assignments = []
  for (const lesson of [...demoLessons].sort((left, right) =>
    `${left.weekStart}:${left.dayOfWeek}:${left.period}:${left._id}`
      .localeCompare(`${right.weekStart}:${right.dayOfWeek}:${right.period}:${right._id}`),
  )) {
    const currentRoom = rooms.find((room) => room._id.toString() === lesson.roomId?.toString())
    const slotKey = (room) => `${room._id}:${lesson.weekStart}:${lesson.dayOfWeek}:${lesson.period}`
    const room = currentRoom && demoRoomCanHost(currentRoom, lesson.type) && !occupied.has(slotKey(currentRoom))
      ? currentRoom
      : rooms.find((candidate) =>
        demoRoomCanHost(candidate, lesson.type) && !occupied.has(slotKey(candidate)),
      )
    if (!room) {
      throw new Error(`Demo dars uchun bo‘sh, mos xona topilmadi (${lesson.weekStart}, ${lesson.dayOfWeek}-kun, ${lesson.period}-para).`)
    }
    occupied.add(slotKey(room))
    assignments.push({
      lesson,
      room,
      roomName: formatRoomName(room.building.name, room.number),
    })
  }

  if (assignments.length) {
    await Lesson.updateMany({ _id: { $in: assignments.map(({ lesson }) => lesson._id) } }, { $unset: { roomId: '' } })
    await Lesson.bulkWrite(assignments.map(({ lesson, room, roomName }) => ({
      updateOne: {
        filter: { _id: lesson._id },
        update: {
          $set: {
            roomId: room._id,
            room: roomName,
            roomKey: normalizeRoomKey(roomName),
          },
        },
      },
    })))
    for (const { lesson, room, roomName } of assignments) {
      lesson.roomId = room._id
      lesson.room = roomName
      lesson.roomKey = normalizeRoomKey(roomName)
    }
  }
  return assignments.length
}

async function seedDatabase() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL
  const password = process.env.SEED_PASSWORD

  if (!uri) throw new Error('MONGODB_URI yoki DATABASE_URL talab qilinadi.')
  if (!password || password.length < 8) {
    throw new Error('SEED_PASSWORD env qiymati kamida 8 ta belgidan iborat bo‘lishi kerak.')
  }

  await mongoose.connect(uri)
  console.log('MongoDB bilan ulanish o‘rnatildi.')

  const expectedAccounts = buildDemoAccountSpecs({
    teachers: TEACHERS,
    groupNames: GROUP_NAMES,
    studentsPerGroup: STUDENTS_PER_GROUP,
    emailDomain: EMAIL_DOMAIN,
  })
  const legacyAccounts = buildDemoAccountSpecs({
    teachers: TEACHERS,
    groupNames: GROUP_NAMES,
    studentsPerGroup: STUDENTS_PER_GROUP,
    emailDomain: LEGACY_EMAIL_DOMAIN,
  })
  const allAccountSpecs = [...expectedAccounts, ...legacyAccounts]
  const existingGroups = await Group.find({ name: { $in: GROUP_NAMES } }).select('_id name').lean()
  const existingAccounts = await User.find({ email: { $in: allAccountSpecs.map(({ email }) => email) } })
    .select('email role +isDemoAccount')
    .lean()
  for (const account of existingAccounts) {
    const expected = allAccountSpecs.find(({ email }) => email === account.email)
    if (account.role !== expected.role) {
      throw new Error(`Demo email ${account.email} already belongs to a different role; no seed data was changed.`)
    }
    if (expected.email.endsWith(`@${EMAIL_DOMAIN}`) && account.isDemoAccount !== true) {
      throw new Error(`Demo email ${account.email} already belongs to a non-demo account; no seed data was changed.`)
    }
  }

  if (resetDemo) {
    const knownEmails = new Set(allAccountSpecs.map(({ email }) => email))
    const usersInDemoGroups = await User.find({ group: { $in: existingGroups.map(({ _id }) => _id) } })
      .select('email')
      .lean()
    const unexpectedGroupUsers = usersInDemoGroups.filter(({ email }) => !knownEmails.has(email))
    if (unexpectedGroupUsers.length) {
      throw new Error('A demo group contains non-seed accounts; reset was stopped to avoid deleting unrelated data.')
    }

    const teacherIds = existingAccounts
      .filter(({ role }) => role === 'teacher')
      .map(({ _id }) => _id)
    const lessonFilter = buildDemoLessonCleanupFilter(
      existingGroups.map(({ _id }) => _id),
      teacherIds,
    )
    if (lessonFilter) await Lesson.deleteMany(lessonFilter)

    const legacyEmails = legacyAccounts.map(({ email }) => email)
    const demoEmails = expectedAccounts.map(({ email }) => email)
    await User.deleteMany({ email: { $in: legacyEmails } })
    await User.deleteMany({ email: { $in: demoEmails }, isDemoAccount: true })
    await Group.deleteMany({ name: { $in: GROUP_NAMES } })
    console.log('Oldingi demo guruhlar, akkauntlar va ularga tegishli darslar tozalandi.')
  }

  const faculty = await Faculty.findOneAndUpdate(
    { name: FACULTY_NAME },
    { $setOnInsert: { name: FACULTY_NAME, isActive: true } },
    { upsert: true, new: true, runValidators: true },
  )
  const departments = await Promise.all(DEPARTMENT_SPECS.map(({ name }) =>
    Department.findOneAndUpdate(
      { faculty: faculty._id, name },
      { $setOnInsert: { faculty: faculty._id, name, isActive: true } },
      { upsert: true, new: true, runValidators: true },
    ),
  ))
  const demoDirections = await Promise.all(DEPARTMENT_SPECS.flatMap((departmentSpec, index) =>
    departmentSpec.directions.map((name) =>
      Direction.findOneAndUpdate(
        { department: departments[index]._id, name },
        { $setOnInsert: { department: departments[index]._id, name, isActive: true } },
        { upsert: true, new: true, runValidators: true },
      ),
    ),
  ))

  const groups = await Promise.all(GROUP_NAMES.map(async (name, index) => {
    const direction = demoDirections[index % demoDirections.length]
    return Group.findOneAndUpdate(
      { name },
      { $set: { direction: direction._id }, $setOnInsert: { name, year: (index % 4) + 1 } },
      { upsert: true, new: true, runValidators: true },
    )
  }))

  const subjects = await Promise.all(SUBJECTS.map((name, index) =>
    Subject.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, color: `#${['6658d3', '3186c8', '2b9b78', 'd98642', 'bd5a77'][index % 5]}` } },
      { upsert: true, new: true, runValidators: true },
    ),
  ))
  const demoRooms = await seedDemoBuildings()

  const passwordHash = await bcrypt.hash(password, 12)
  const teachers = await Promise.all(TEACHERS.map((name, index) => {
    const email = `teacher${String(index + 1).padStart(2, '0')}@${EMAIL_DOMAIN}`
    const directionIds = [demoDirections[index % demoDirections.length]._id]
    if (index % 2 === 1) {
      directionIds.push(demoDirections[(index + 1) % demoDirections.length]._id)
    }
    const firstSubjectIndex = (index * 3) % subjects.length
    const subjectIds = [0, 1, 2, 3, 4].map((offset) => subjects[(firstSubjectIndex + offset) % subjects.length]._id)
    return User.findOneAndUpdate(
      { email },
      {
        $set: {
          name,
          email,
          password: passwordHash,
          role: 'teacher',
          group: null,
          directions: directionIds,
          subjects: subjectIds,
          isActive: true,
          isDemoAccount: true,
        },
      },
      { upsert: true, new: true, runValidators: true, select: '+password' },
    )
  }))

  const students = await Promise.all(groups.flatMap((group, groupIndex) =>
    Array.from({ length: STUDENTS_PER_GROUP }, (_value, studentIndex) => {
      const email = `student${String(studentIndex + 1).padStart(2, '0')}.g${String(groupIndex + 1).padStart(2, '0')}@${EMAIL_DOMAIN}`
      const name = `Talaba ${String(studentIndex + 1).padStart(2, '0')} · ${group.name}`
      return User.findOneAndUpdate(
        { email },
        {
          $set: {
            name,
            email,
            password: passwordHash,
            role: 'student',
            group: group._id,
            isActive: true,
            isDemoAccount: true,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
    }),
  ))

  const currentWeekStart = (await ensureLessonWeeks(Lesson)).weekStart
  const existingLessons = await Lesson.find({
    $or: [
      { groups: { $in: groups.map((group) => group._id) } },
      { teacher: { $in: teachers.map((teacher) => teacher._id) } },
    ],
  }).select('groups teacher subject type dayOfWeek period weekStart room roomId').lean()
  const roomAssignments = await attachDemoRooms(existingLessons, groups, demoRooms)
  const demoDirectionByGroupId = new Map(
    groups.map((group) => [group._id.toString(), group.direction.toString()]),
  )
  const teacherById = new Map(teachers.map((teacher) => [teacher._id.toString(), teacher]))
  const reconciledTeachers = new Set()
  for (const lesson of existingLessons) {
    const teacher = teacherById.get(lesson.teacher.toString())
    if (!teacher) continue

    const lessonGroupDirectionIds = lesson.groups
      .map((groupId) => demoDirectionByGroupId.get(groupId.toString()))
      .filter(Boolean)
    if (!lessonGroupDirectionIds.length) continue

    teacher.directions = [...new Set([
      ...(teacher.directions || []).map((directionId) => directionId.toString()),
      ...lessonGroupDirectionIds,
    ])]
    teacher.subjects = [...new Set([
      ...(teacher.subjects || []).map((subjectId) => subjectId.toString()),
      lesson.subject.toString(),
    ])]
    reconciledTeachers.add(teacher)
  }
  if (reconciledTeachers.size) {
    await Promise.all([...reconciledTeachers].map((teacher) => teacher.save()))
  }
  const weekStarts = [-2, -1, 0, 1, 2, 3].map((offset) => addDays(currentWeekStart, offset * 7))
  const lessonAssignments = buildDemoAssignments({
    groups,
    teachers,
    subjects,
    weekStarts,
    existingLessons,
    rooms: demoRooms,
  })
  if (lessonAssignments.length) await Lesson.insertMany(lessonAssignments, { ordered: true })

  console.log(`Tayyor: ${faculty.name}, ${departments.length} kafedra, ${demoDirections.length} yo‘nalish, ${groups.length} demo guruh, ${teachers.length} o‘qituvchi, ${students.length} talaba, ${subjects.length} fan.`)
  console.log(`${reconciledTeachers.size} demo o‘qituvchining yo‘nalish va fan biriktirishlari mavjud darslarga moslandi.`)
  console.log(`${DEMO_BUILDINGS.length} demo bino va ${demoRooms.length} demo xona ta’minlandi; ${roomAssignments} mavjud demo darsga xona biriktirildi.`)
  console.log(`${lessonAssignments.length} ta yangi dars ${weekStarts.length} hafta uchun qo‘shildi; mavjud slotlar o‘chirilmagan.`)
  console.log(`Haftalar: ${weekStarts[0]} — ${weekStarts[weekStarts.length - 1]}`)
  console.log('Barcha demo akkauntlar SEED_PASSWORD bilan berilgan paroldan foydalanadi.')
  console.log('O‘qituvchi loginlari:')
  teachers.forEach((teacher) => console.log(`- ${teacher.name}: ${teacher.email}`))
  console.log(`Talaba loginlari: student01.g01@${EMAIL_DOMAIN} ... student05.g10@${EMAIL_DOMAIN}`)
  console.log('Guruhlar: DEMO-G01 ... DEMO-G10')
}

const unknownArgs = process.argv.slice(2).filter((argument) => argument !== '--reset-demo')
if (unknownArgs.length) {
  console.error(`Noma’lum argument: ${unknownArgs.join(' ')}`)
  process.exitCode = 1
} else seedDatabase()
  .catch((error) => {
    console.error('Demo ma’lumotlarini kiritib bo‘lmadi:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
