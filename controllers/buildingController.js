const mongoose = require('mongoose')
const Building = require('../models/Building')
const Lesson = require('../models/Lesson')
const Room = require('../models/Room')
const { formatRoomName, normalizeRoomKey, roomMatchPattern } = require('../utils/room')
const { getWeekStart } = require('../utils/week')
const { emitRealtime } = require('../utils/realtimeEvents')

const ROOM_KINDS = ['lecture', 'classroom', 'laboratory', 'multi']

function validLessonSlot(query) {
  const keys = ['weekStart', 'dayOfWeek', 'period']
  const provided = keys.filter((key) => query[key] !== undefined)
  if (!provided.length) return { value: null }
  if (provided.length !== keys.length) {
    return { error: 'Bandlikni tekshirish uchun hafta, hafta kuni va para birga yuborilishi kerak.' }
  }

  const weekStart = typeof query.weekStart === 'string' ? getWeekStart(query.weekStart) : null
  const dayOfWeek = Number(query.dayOfWeek)
  const period = Number(query.period)
  if (
    !weekStart ||
    !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6 ||
    !Number.isInteger(period) || period < 1 || period > 8
  ) {
    return { error: 'Hafta, hafta kuni yoki para qiymati noto‘g‘ri.' }
  }
  if (query.excludeLessonId && !mongoose.isValidObjectId(query.excludeLessonId)) {
    return { error: 'Dars identifikatori noto‘g‘ri.' }
  }
  return { value: { weekStart, dayOfWeek, period } }
}

function lessonSummary(lesson) {
  return {
    id: lesson._id.toString(),
    type: lesson.type,
    subject: lesson.subject?.name || 'Fan',
    teacher: lesson.teacher?.name || 'O‘qituvchi',
    groups: (lesson.groups || []).map((group) => group.name),
  }
}

async function listBuildings(req, res) {
  const slot = validLessonSlot(req.query)
  if (slot.error) return res.status(400).json({ message: slot.error })
  if (req.query.buildingId && !mongoose.isValidObjectId(req.query.buildingId)) {
    return res.status(400).json({ message: 'Bino identifikatori noto‘g‘ri.' })
  }

  const buildingFilter = req.query.buildingId ? { _id: req.query.buildingId } : {}
  const [buildings, rooms] = await Promise.all([
    Building.find(buildingFilter).sort({ name: 1 }).lean(),
    Room.find(req.query.buildingId ? { building: req.query.buildingId } : {})
      .sort({ floor: 1, number: 1 })
      .lean(),
  ])
  const occupiedByRoom = new Map()

  if (slot.value) {
    const filter = { ...slot.value }
    if (req.query.excludeLessonId) filter._id = { $ne: req.query.excludeLessonId }
    const lessons = await Lesson.find(filter)
      .select('room roomId type subject teacher groups')
      .populate('roomId', 'building number')
      .populate('subject', 'name')
      .populate('teacher', 'name')
      .populate('groups', 'name')
      .lean()
    const knownRoomKeys = new Map(
      rooms.map((room) => {
        const building = buildings.find(({ _id }) => _id.toString() === room.building.toString())
        return [normalizeRoomKey(formatRoomName(building?.name || '', room.number)), room._id.toString()]
      }),
    )

    for (const lesson of lessons) {
      const roomId = lesson.roomId?._id?.toString() || lesson.roomId?.toString()
      const roomKey = normalizeRoomKey(lesson.room || '')
      const targetId = roomId && rooms.some((room) => room._id.toString() === roomId)
        ? roomId
        : knownRoomKeys.get(roomKey)
      if (targetId) occupiedByRoom.set(targetId, lessonSummary(lesson))
    }
  }

  const roomsByBuilding = new Map()
  for (const room of rooms) {
    const buildingId = room.building.toString()
    const lessons = occupiedByRoom.get(room._id.toString())
    const item = {
      id: room._id.toString(),
      buildingId,
      number: room.number,
      floor: room.floor,
      capacity: room.capacity,
      kind: room.kind,
      isActive: room.isActive,
      occupied: Boolean(lessons),
      lesson: lessons || null,
    }
    roomsByBuilding.set(buildingId, [...(roomsByBuilding.get(buildingId) || []), item])
  }

  res.json(buildings.map((building) => ({
    id: building._id.toString(),
    name: building.name,
    address: building.address,
    isActive: building.isActive,
    rooms: roomsByBuilding.get(building._id.toString()) || [],
  })))
}

function parseBuildingInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const address = typeof body?.address === 'string' ? body.address.trim() : ''
  if (!name || name.length > 100 || address.length > 200) {
    return { error: 'Bino nomini kiriting (ko‘pi bilan 100 belgi), manzil esa 200 belgidan oshmasin.' }
  }
  return { value: { name, address } }
}

async function createBuilding(req, res) {
  const result = parseBuildingInput(req.body)
  if (result.error) return res.status(400).json({ message: result.error })
  if (await Building.exists({ name: result.value.name })) {
    return res.status(409).json({ message: 'Bu nomdagi bino allaqachon mavjud.' })
  }
  try {
    const building = await Building.create(result.value)
    emitRealtime(req, ['role:admin'], { type: 'rooms:changed' })
    res.status(201).json({ ...building.toJSON(), rooms: [] })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Bu nomdagi bino allaqachon mavjud.' })
    throw error
  }
}

async function updateBuilding(req, res) {
  const building = await Building.findById(req.params.id)
  if (!building) return res.status(404).json({ message: 'Bino topilmadi.' })

  const result = parseBuildingInput(req.body)
  if (result.error) return res.status(400).json({ message: result.error })
  if (await Building.exists({ name: result.value.name, _id: { $ne: building._id } })) {
    return res.status(409).json({ message: 'Bu nomdagi bino allaqachon mavjud.' })
  }
  building.name = result.value.name
  building.address = result.value.address
  if (typeof req.body?.isActive === 'boolean') building.isActive = req.body.isActive
  try {
    await building.save()
    emitRealtime(req, ['role:admin'], { type: 'rooms:changed' })
    res.json(building)
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Bu nomdagi bino allaqachon mavjud.' })
    throw error
  }
}

async function deleteBuilding(req, res) {
  const building = await Building.findById(req.params.id)
  if (!building) return res.status(404).json({ message: 'Bino topilmadi.' })
  if (await Room.exists({ building: building._id })) {
    return res.status(409).json({ message: 'Avval binodagi xonalarni o‘chiring yoki boshqa binoga ko‘chiring.' })
  }
  await building.deleteOne()
  emitRealtime(req, ['role:admin'], { type: 'rooms:changed' })
  res.status(204).end()
}

async function parseRoomInput(body, currentRoomId = null) {
  const number = typeof body?.number === 'string' ? body.number.trim() : ''
  const buildingId = body?.buildingId
  const floor = body?.floor === '' || body?.floor === null || body?.floor === undefined
    ? null
    : Number(body.floor)
  const capacity = Number(body?.capacity)
  const kind = body?.kind

  if (
    !number || number.length > 40 ||
    !mongoose.isValidObjectId(buildingId) ||
    (floor !== null && (!Number.isInteger(floor) || floor < 1 || floor > 100)) ||
    !Number.isInteger(capacity) || capacity < 1 || capacity > 2000 ||
    !ROOM_KINDS.includes(kind)
  ) {
    return { error: 'Bino, xona raqami, sig‘imi, qavat va xona turini tekshiring.' }
  }

  const building = await Building.findById(buildingId).select('name isActive')
  if (!building || building.isActive === false) {
    return { error: 'Faol binoni tanlang.' }
  }
  if (await Room.exists({
    building: building._id,
    number,
    ...(currentRoomId ? { _id: { $ne: currentRoomId } } : {}),
  })) {
    return { conflict: 'Bu binoda shu raqamli xona allaqachon mavjud.' }
  }
  return { value: { building: building._id, number, floor, capacity, kind }, building }
}

async function createRoom(req, res) {
  const result = await parseRoomInput({ ...req.body, buildingId: req.params.buildingId })
  if (result.error) return res.status(400).json({ message: result.error })
  if (result.conflict) return res.status(409).json({ message: result.conflict })
  try {
    const room = await Room.create(result.value)
    emitRealtime(req, ['role:admin'], { type: 'rooms:changed' })
    res.status(201).json({
      id: room._id.toString(),
      buildingId: result.building._id.toString(),
      number: room.number,
      floor: room.floor,
      capacity: room.capacity,
      kind: room.kind,
      isActive: room.isActive,
      occupied: false,
      lesson: null,
    })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Bu binoda shu raqamli xona allaqachon mavjud.' })
    throw error
  }
}

async function updateRoom(req, res) {
  const room = await Room.findById(req.params.id)
  if (!room) return res.status(404).json({ message: 'Xona topilmadi.' })

  const result = await parseRoomInput(req.body, room._id)
  if (result.error) return res.status(400).json({ message: result.error })
  if (result.conflict) return res.status(409).json({ message: result.conflict })
  Object.assign(room, result.value)
  if (typeof req.body?.isActive === 'boolean') room.isActive = req.body.isActive
  try {
    await room.save()
    emitRealtime(req, ['role:admin'], { type: 'rooms:changed' })
    res.json({
      id: room._id.toString(),
      buildingId: room.building.toString(),
      number: room.number,
      floor: room.floor,
      capacity: room.capacity,
      kind: room.kind,
      isActive: room.isActive,
    })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Bu binoda shu raqamli xona allaqachon mavjud.' })
    throw error
  }
}

async function deleteRoom(req, res) {
  const room = await Room.findById(req.params.id).populate('building', 'name')
  if (!room) return res.status(404).json({ message: 'Xona topilmadi.' })
  const roomKey = normalizeRoomKey(formatRoomName(room.building.name, room.number))
  const scheduled = await Lesson.exists({
    $or: [{ roomId: room._id }, { roomKey }, { room: roomMatchPattern(roomKey) }],
  })
  if (scheduled) {
    return res.status(409).json({ message: 'Bu xona jadvaldagi darslarga biriktirilgan. Avval darslarni boshqa xonaga ko‘chiring yoki o‘chiring.' })
  }
  await room.deleteOne()
  emitRealtime(req, ['role:admin'], { type: 'rooms:changed' })
  res.status(204).end()
}

module.exports = {
  listBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  createRoom,
  updateRoom,
  deleteRoom,
}
