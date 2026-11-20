const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const Lesson = require('../models/Lesson')
const User = require('../models/User')
const { ensureLessonGroups, ensureLessonWeeks, syncLessonIndexes } = require('../utils/lessonWeeks')

async function connectDatabase() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL

  if (!uri) {
    throw new Error('Set MONGODB_URI (or DATABASE_URL) to your MongoDB Atlas connection string.')
  }
  const isAtlasSrv = uri.startsWith('mongodb+srv://')

  // Atlas uchun TLS tekshiruvi yoqilgan holatda qoladi. Sertifikatni e'tiborsiz
  // qoldirish (`tlsInsecure`) production'da xavfli bo'lgani uchun ishlatilmaydi.
  mongoose.connection.on('error', (error) => {
    console.error('[MongoDB] Connection error:', error.message)
  })
  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Connection lost; the driver will retry automatically.')
  })
  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Connection restored.')
  })

  await mongoose.connect(uri, {
    ...(isAtlasSrv ? { tls: true } : {}),
    retryWrites: true,
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 10,
    minPoolSize: 0,
  })
  console.log('Connected to MongoDB')

  const { weekStart, modifiedCount } = await ensureLessonWeeks(Lesson)
  if (modifiedCount) {
    console.log(`${modifiedCount} ta eski dars ${weekStart} haftasiga biriktirildi`)
  }
  const { modifiedCount: groupedCount } = await ensureLessonGroups(Lesson)
  if (groupedCount) {
    console.log(`${groupedCount} ta eski dars guruhlar massiviga o‘tkazildi`)
  }
  // Eski darslar ham yangi yuklama hisob-kitobida aniq davomiylikka ega bo‘ladi.
  const timingResult = await Lesson.updateMany(
    { $or: [{ durationMinutes: { $exists: false } }, { academicHours: { $exists: false } }, { status: { $exists: false } }] },
    { $set: { durationMinutes: 80, academicHours: 2, status: 'planned' } },
  )
  if (timingResult.modifiedCount) console.log(`${timingResult.modifiedCount} ta eski darsga akademik yuklama qo‘shildi`)
  await syncLessonIndexes(Lesson)

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const email = ADMIN_EMAIL.trim().toLowerCase()
    const existingAdmin = await User.findOne({ email, role: 'admin' })

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
      await User.create({
        name: ADMIN_NAME?.trim() || 'OXU administrator',
        email,
        password: passwordHash,
        role: 'admin',
      })
      console.log(`Initial administrator created for ${email}`)
    }
  }
}

module.exports = connectDatabase
