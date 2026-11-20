const { getWeekStart } = require('./week')

async function ensureLessonWeeks(Lesson) {
  const weekStart = getWeekStart()
  const result = await Lesson.collection.updateMany(
    { $or: [{ weekStart: { $exists: false } }, { weekStart: null }, { weekStart: '' }] },
    { $set: { weekStart } },
  )

  return { weekStart, modifiedCount: result.modifiedCount }
}

async function syncLessonIndexes(Lesson) {
  try {
    await Lesson.syncIndexes()
    return true
  } catch (error) {
    console.warn('Dars indekslarini yangilab bo‘lmadi:', error.message)
    return false
  }
}

// Eski `group` maydonini guruhlar massiviga o‘tkazadi va dars turini to‘ldiradi.
async function ensureLessonGroups(Lesson) {
  const migrated = await Lesson.collection.updateMany(
    { groups: { $exists: false }, group: { $exists: true } },
    [{ $set: { groups: ['$group'] } }],
  )

  await Lesson.collection.updateMany(
    { group: { $exists: true } },
    [{ $unset: ['group'] }],
  )

  // Bitta guruh maydoniga qurilgan eski unikal indeks yangi massiv indeksiga xalaqit beradi.
  const indexes = await Lesson.collection.indexes().catch(() => [])
  const legacyIndex = indexes.find((index) => index.key && index.key.group === 1)
  if (legacyIndex) {
    try {
      await Lesson.collection.dropIndex(legacyIndex.name)
    } catch (error) {
      console.warn('Eski dars indeksini o‘chirib bo‘lmadi:', error.message)
    }
  }

  await Lesson.collection.updateMany(
    { type: { $exists: false } },
    { $set: { type: 'practice' } },
  )

  return { modifiedCount: migrated.modifiedCount }
}

module.exports = { ensureLessonGroups, ensureLessonWeeks, syncLessonIndexes }
