const mongoose = require('mongoose')
const Room = require('../models/Room')
const Group = require('../models/Group')
const Lesson = require('../models/Lesson')
const Subject = require('../models/Subject')
const TeacherAvailability = require('../models/TeacherAvailability')
const User = require('../models/User')
const { notifyTeacherLesson } = require('../services/telegramNotification')
const { canTeachSubject } = require('../utils/teacherSubjects')
const { formatRoomName, normalizeRoomKey, roomMatchPattern } = require('../utils/room')
const { getWeekStart, addDays, getTodayDateKey } = require('../utils/week')
const { resolveDirectionScope } = require('../utils/academicStructure')
const { emitRealtime, lessonChangedEvent, roomsForLessons } = require('../utils/realtimeEvents')
const { ACADEMIC_HOURS_PER_PAIR, PAIR_DURATION_MINUTES, reserveHours, releaseHours } = require('../utils/academicLoad')
const { validateGroupSchedule } = require('../utils/groupSchedule')

async function populateLesson(query) {
  const result = await query
    .populate('groups', 'name')
    .populate('subject', 'name color')
    .populate('teacher', 'name email telegramId')
    .populate({ path: 'roomId', select: 'number building kind', populate: { path: 'building', select: 'name' } })
  const lessons = Array.isArray(result) ? result : [result]
  for (const lesson of lessons) {
    if (lesson?.roomId?.building?.name) {
      lesson.room = formatRoomName(lesson.roomId.building.name, lesson.roomId.number)
    }
  }
  return result
}

const LESSON_TYPES = ['lecture', 'practice', 'lab']
const MAX_LECTURE_GROUPS = 6

function normalizeGroupIds(body) {
  const raw = Array.isArray(body?.groupIds)
    ? body.groupIds
    : body?.groupId
      ? [body.groupId]
      : []
  return [...new Set(raw.map((groupId) => String(groupId)))]
}

async function listLessons(req, res) {
  const filter = {}
  const directionScope = await resolveDirectionScope(req.query)
  if (directionScope?.error) return res.status(400).json({ message: directionScope.error })
  if (directionScope && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Ta’lim tuzilmasi filtrlari faqat administrator uchun.' })
  }
  if (directionScope && !directionScope.directionIds.length) return res.json([])

  if (req.user.role === 'teacher') {
    filter.teacher = req.user._id
  } else if (req.user.role === 'student') {
    if (!req.user.group) return res.json([])
    filter.groups = req.user.group._id
  } else {
    if (req.query.teacherId) filter.teacher = req.query.teacherId
    if (req.query.teacherIds !== undefined) {
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
  }

  const groupFilters = []
  if (req.user.role === 'admin' && req.query.groupId) {
    groupFilters.push({ groups: req.query.groupId })
  }
  if (directionScope) {
    const groups = await Group.find({ direction: { $in: directionScope.directionIds } }).select('_id').lean()
    if (!groups.length) return res.json([])
    groupFilters.push({ groups: { $in: groups.map(({ _id }) => _id) } })
  }
  if (groupFilters.length === 1) filter.groups = groupFilters[0].groups
  if (groupFilters.length > 1) filter.$and = groupFilters

  if (req.query.dayOfWeek) filter.dayOfWeek = Number(req.query.dayOfWeek)

  if (req.query.weekStart !== undefined) {
    const weekStart = typeof req.query.weekStart === 'string' && req.query.weekStart
      ? getWeekStart(req.query.weekStart)
      : null
    if (!weekStart) {
      return res.status(400).json({ message: 'Hafta sanasi YYYY-MM-DD formatida bo‘lishi kerak.' })
    }
    filter.weekStart = weekStart
  }

  res.json(await populateLesson(Lesson.find(filter).sort({ dayOfWeek: 1, period: 1 })))
}

async function validateLessonFields(input, currentLessonId = null) {
  const body = input && typeof input === 'object' ? input : {}
  const { subjectId, teacherId, roomId, dayOfWeek, period, weekStart: rawWeekStart, type: rawType } = body
  const type = rawType === undefined ? 'lecture' : String(rawType)
  const groupIds = normalizeGroupIds(body)
  const day = Number(dayOfWeek)
  const lessonPeriod = Number(period)
  const weekStart = typeof rawWeekStart === 'string' && rawWeekStart ? getWeekStart(rawWeekStart) : null
  if (
    !groupIds.length ||
    groupIds.length > MAX_LECTURE_GROUPS ||
    groupIds.some((groupId) => !mongoose.isValidObjectId(groupId)) ||
    !LESSON_TYPES.includes(type) ||
    (type !== 'lecture' && groupIds.length !== 1) ||
    !mongoose.isValidObjectId(subjectId) ||
    !mongoose.isValidObjectId(teacherId) ||
    !Number.isInteger(day) || day < 1 || day > 6 ||
    !Number.isInteger(lessonPeriod) || lessonPeriod < 1 || lessonPeriod > 8 ||
    !weekStart ||
    !mongoose.isValidObjectId(roomId)
  ) {
    return {
      error: 'Guruh, fan, o‘qituvchi, xona, dars turi, hafta, hafta kuni va para ma’lumotlarini tekshiring. Ma’ruzaga 6 tagacha guruh, amaliyot va laboratoriyaga bitta guruh tanlanadi.',
    }
  }

  const lessonDate = addDays(weekStart, day - 1)
  const todayDate = getTodayDateKey()
  if (!lessonDate || lessonDate <= todayDate) {
    return {
      error: 'Dars faqat kamida 1 kun oldin (ertangi va kelgusi kunlarga) rejalashtirilishi mumkin. Bugungi va o‘tgan kunlarga dars qo‘yib bo‘lmaydi.',
    }
  }

  const [groups, subject, teacher, roomRecord, currentLesson, studentCount] = await Promise.all([
    Group.find({ _id: { $in: groupIds } }).select('isActive').lean(),
    Subject.findById(subjectId).select('name groups hours'),
    User.findById(teacherId).select('role isActive subjects'),
    Room.findById(roomId).populate('building', 'name isActive'),
    currentLessonId ? Lesson.findById(currentLessonId).select('groups').lean() : null,
    User.countDocuments({ role: 'student', isActive: true, group: { $in: groupIds } }),
  ])
  if (groups.length !== groupIds.length) {
    return { error: 'Tanlangan guruhlardan biri topilmadi.' }
  }
  if (!subject || !teacher || teacher.role !== 'teacher' || teacher.isActive === false) {
    return { error: 'Tanlangan fan yoki faol o‘qituvchi topilmadi.' }
  }
  const assignedGroups = new Set((subject.groups || []).map((groupId) => groupId.toString()))
  if (groupIds.some((groupId) => !assignedGroups.has(groupId))) {
    return { error: 'Tanlangan guruhlardan biri ushbu fanga biriktirilmagan.' }
  }
  if (!roomRecord || !roomRecord.building || roomRecord.isActive === false || roomRecord.building.isActive === false) {
    return { error: 'Faol binodagi faol xonani tanlang.' }
  }
  const roomSupportsLesson = roomRecord.kind === 'multi'
    || (type === 'lab'
      ? roomRecord.kind === 'laboratory'
      : roomRecord.kind !== 'laboratory')
  if (!roomSupportsLesson) {
    return { error: 'Tanlangan dars turi uchun bu xona mos emas.' }
  }
  if (studentCount > roomRecord.capacity) {
    return { error: `Tanlangan guruhlarda ${studentCount} talaba bor, xona sig‘imi esa ${roomRecord.capacity} o‘rin.` }
  }

  // Yangi dars faqat faol guruhlarga qo‘shiladi; tahrirlashda mavjud nofaol guruh qoldirilishi mumkin.
  const currentGroupIds = new Set((currentLesson?.groups || []).map((groupId) => groupId.toString()))
  if (groups.some((group) => group.isActive === false && !currentGroupIds.has(group._id.toString()))) {
    return { error: 'Nofaol guruhni tanlab bo‘lmaydi. Avval guruhni faollashtiring.' }
  }

  // Jadvaldagi eski darslar ruxsat bermaydi; faqat hisobda biriktirilgan fan tanlanadi.
  if (!canTeachSubject(teacher.subjects || [], subjectId)) {
    return { error: 'Bu fan o‘qituvchiga biriktirilmagan. Hisoblar bo‘limida o‘qituvchiga fanni qo‘shing.' }
  }

  // Bir parada bir o‘qituvchi va bir guruh faqat bitta darsda bo‘lishi mumkin.
  const slotFilter = { weekStart, dayOfWeek: day, period: lessonPeriod }
  if (currentLessonId) slotFilter._id = { $ne: currentLessonId }

  const [teacherClash, groupClash, teacherAvailability] = await Promise.all([
    Lesson.exists({ ...slotFilter, teacher: teacherId }),
    Lesson.exists({ ...slotFilter, groups: { $in: groupIds } }),
    TeacherAvailability.exists({ teacher: teacherId, weekStart, dayOfWeek: day, period: lessonPeriod }),
  ])
  if (teacherClash) {
    return { conflict: 'O‘qituvchining bu parada boshqa darsi bor. Boshqa para yoki o‘qituvchini tanlang.' }
  }
  if (groupClash) {
    return { conflict: 'Tanlangan guruhlardan biri bu parada boshqa darsga biriktirilgan. Bir guruhga bir parada faqat bitta dars qo‘yiladi.' }
  }
  if (teacherAvailability) {
    return { conflict: 'O‘qituvchi bu vaqtni band qilib qo‘ygan.' }
  }

  const normalizedRoom = formatRoomName(roomRecord.building.name, roomRecord.number)
  const roomKey = normalizeRoomKey(normalizedRoom)
  const [roomIdClash, roomNameClash] = await Promise.all([
    Lesson.exists({ ...slotFilter, roomId }),
    Lesson.exists({
      ...slotFilter,
      $or: [
        { roomKey },
        { room: roomMatchPattern(roomKey) },
      ],
    }),
  ])
  if (roomIdClash || roomNameClash) {
    return { conflict: `“${normalizedRoom}” xona bu hafta, shu kun va ${lessonPeriod}-parada band. Boshqa xona yoki para tanlang.` }
  }

  return {
    value: {
      groups: groupIds,
      type,
      subject: subjectId,
      teacher: teacherId,
      roomId: roomRecord._id,
      dayOfWeek: day,
      period: lessonPeriod,
      weekStart,
      room: normalizedRoom,
      roomKey,
      durationMinutes: PAIR_DURATION_MINUTES,
      academicHours: ACADEMIC_HOURS_PER_PAIR,
      status: 'planned',
    },
    subject,
  }
}

function isDuplicateSlotError(error) {
  return Boolean(error && error.code === 11000)
}

function isDuplicateRoomError(error) {
  return Boolean(error?.keyPattern?.roomKey || error?.keyPattern?.roomId)
}

function duplicateSlotMessage() {
  return 'Bu haftada tanlangan o‘qituvchi yoki guruh uchun bu para allaqachon band.'
}

function duplicateRoomMessage(room) {
  return `“${room}” xona bu hafta, shu kun va para band. Boshqa xona yoki para tanlang.`
}

function subjectHoursMessage(error) {
  return error?.code === 'SUBJECT_HOURS_EXCEEDED' || /fan yuklamasida soat ajratilmagan/.test(error?.message || '')
}

async function createLesson(req, res) {
  const result = await validateLessonFields(req.body)
  if (result.error) return res.status(400).json({ message: result.error })
  if (result.conflict) return res.status(409).json({ message: result.conflict })

  try {
    const session = await mongoose.startSession()
    let lesson
    try {
      await session.withTransaction(async () => {
        await validateGroupSchedule({ newLesson: result.value, session })
        await reserveHours({ subject: result.subject, groupIds: result.value.groups, type: result.value.type, session })
        lesson = await Lesson.create([result.value], { session }).then(([item]) => item)
      })
    } finally {
      await session.endSession()
    }
    const populated = await populateLesson(Lesson.findById(lesson._id))
    emitRealtime(
      req,
      roomsForLessons([populated]),
      lessonChangedEvent(populated._id, [populated], 'created'),
    )

    // O'qituvchiga Telegram xabar yuborish
    notifyTeacherLesson({ lesson: populated, action: 'created' }).catch((notifyError) => {
      console.error('[LessonController] Telegram notification failed:', notifyError.message)
    })

    res.status(201).json(populated)
  } catch (error) {
    if (error?.code === 'GROUP_SCHEDULE_GAP' || subjectHoursMessage(error)) return res.status(409).json({ message: error.message })
    if (isDuplicateRoomError(error)) return res.status(409).json({ message: duplicateRoomMessage(result.value.room) })
    if (isDuplicateSlotError(error)) return res.status(409).json({ message: duplicateSlotMessage() })
    throw error
  }
}

async function updateLesson(req, res) {
  const existingLesson = await populateLesson(Lesson.findById(req.params.id))
  if (!existingLesson) return res.status(404).json({ message: 'Dars topilmadi.' })

  const result = await validateLessonFields(req.body, req.params.id)
  if (result.error) return res.status(400).json({ message: result.error })
  if (result.conflict) return res.status(409).json({ message: result.conflict })

  try {
    const session = await mongoose.startSession()
    let lesson
    try {
      await session.withTransaction(async () => {
        const rawExisting = await Lesson.findById(req.params.id).session(session)
        if (!rawExisting) throw new Error('Dars topilmadi.')
        await validateGroupSchedule({ oldLesson: rawExisting, newLesson: result.value, session })
        const oldSubject = await Subject.findById(rawExisting.subject).select('hours').session(session)
        if (!oldSubject) throw new Error('Eski darsning fani topilmadi.')
        await releaseHours({ subjectId: rawExisting.subject, groupIds: rawExisting.groups.map(String), type: rawExisting.type, academicHours: rawExisting.academicHours || ACADEMIC_HOURS_PER_PAIR, session })
        await reserveHours({ subject: result.subject, groupIds: result.value.groups, type: result.value.type, session })
        lesson = await Lesson.findByIdAndUpdate(req.params.id, result.value, { new: true, runValidators: true, session })
      })
    } finally {
      await session.endSession()
    }
    if (!lesson) return res.status(404).json({ message: 'Dars topilmadi.' })
    const populated = await populateLesson(Lesson.findById(lesson._id))
    emitRealtime(
      req,
      roomsForLessons([existingLesson, populated]),
      lessonChangedEvent(populated._id, [existingLesson, populated], 'updated'),
    )

    // O'qituvchiga Telegram xabar yuborish
    notifyTeacherLesson({
      lesson: populated,
      action: 'updated',
      oldLesson: existingLesson,
    }).catch((notifyError) => {
      console.error('[LessonController] Telegram notification failed:', notifyError.message)
    })

    res.json(populated)
  } catch (error) {
    if (error?.code === 'GROUP_SCHEDULE_GAP' || subjectHoursMessage(error)) return res.status(409).json({ message: error.message })
    if (isDuplicateRoomError(error)) return res.status(409).json({ message: duplicateRoomMessage(result.value.room) })
    if (isDuplicateSlotError(error)) return res.status(409).json({ message: duplicateSlotMessage() })
    throw error
  }
}

async function deleteLesson(req, res) {
  const existingLesson = await populateLesson(Lesson.findById(req.params.id))
  if (!existingLesson) return res.status(404).json({ message: 'Dars topilmadi.' })

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const rawExisting = await Lesson.findById(req.params.id).session(session)
      if (!rawExisting) throw new Error('Dars topilmadi.')
      await validateGroupSchedule({ oldLesson: rawExisting, session })
      await releaseHours({ subjectId: rawExisting.subject, groupIds: rawExisting.groups.map(String), type: rawExisting.type, academicHours: rawExisting.academicHours || ACADEMIC_HOURS_PER_PAIR, session })
      await Lesson.findByIdAndDelete(req.params.id, { session })
    })
  } catch (error) {
    if (error?.code === 'GROUP_SCHEDULE_GAP') return res.status(409).json({ message: error.message })
    throw error
  } finally {
    await session.endSession()
  }
  emitRealtime(
    req,
    roomsForLessons([existingLesson]),
    lessonChangedEvent(existingLesson._id, [existingLesson], 'deleted'),
  )

  // O'qituvchiga Telegram xabar yuborish
  notifyTeacherLesson({
    lesson: existingLesson,
    action: 'deleted',
  }).catch((notifyError) => {
    console.error('[LessonController] Telegram notification failed:', notifyError.message)
  })

  res.status(204).end()
}

module.exports = { listLessons, createLesson, updateLesson, deleteLesson }
