const { Markup } = require('telegraf')
const User = require('../models/User')

const LESSON_REMINDER_MINUTES = 10

let botInstance = null

function setTelegramBot(bot) {
  botInstance = bot
}

function getTelegramBot() {
  return botInstance
}

const PERIOD_TIMES = {
  1: '08:30 — 09:50',
  2: '10:00 — 11:20',
  3: '11:30 — 12:50',
  4: '13:30 — 14:50',
  5: '15:00 — 16:20',
  6: '16:30 — 17:50',
  7: '18:00 — 19:20',
  8: '19:30 — 20:50',
}

const DAY_NAMES = {
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
}

const LESSON_TYPE_NAMES = {
  lecture: 'Ma’ruza',
  practice: 'Amaliyot',
  lab: 'Laboratoriya',
}

function formatLessonType(type) {
  return LESSON_TYPE_NAMES[type] || 'Ma’ruza'
}

const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
]

function formatLessonDate(weekStartStr, dayOfWeek) {
  if (!weekStartStr || !dayOfWeek) return ''
  const parts = String(weekStartStr).split('-').map(Number)
  if (parts.length !== 3) return ''
  const [year, month, day] = parts
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + (dayOfWeek - 1))
  const d = date.getUTCDate()
  const m = UZ_MONTHS[date.getUTCMonth()]
  const y = date.getUTCFullYear()
  return `${d}-${m}, ${y}`
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Ma’ruzada bir nechta guruh bo‘lishi mumkin — nomlar vergul bilan birlashtiriladi.
function formatGroupNames(lesson) {
  const groups = Array.isArray(lesson?.groups) && lesson.groups.length
    ? lesson.groups
    : lesson?.group
      ? [lesson.group]
      : []
  const names = groups.map((group) => group?.name).filter(Boolean)
  return names.length ? names.join(', ') : 'Noma’lum guruh'
}

function formatCreatedMessage(lesson, teacherName) {
  const dayName = DAY_NAMES[lesson.dayOfWeek] || `${lesson.dayOfWeek}-kun`
  const dateStr = formatLessonDate(lesson.weekStart, lesson.dayOfWeek)
  const fullDate = dateStr ? `${dayName} (${dateStr})` : dayName
  const periodTime = PERIOD_TIMES[lesson.period] || ''
  const periodStr = periodTime ? `${lesson.period}-para (${periodTime})` : `${lesson.period}-para`
  const room = lesson.room && String(lesson.room).trim()
    ? escapeHtml(String(lesson.room).trim())
    : 'Ko‘rsatilmagan'
  const group = escapeHtml(formatGroupNames(lesson))
  const subject = escapeHtml(lesson.subject?.name || 'Noma’lum fan')
  const teacher = escapeHtml(teacherName || lesson.teacher?.name || 'O‘qituvchi')
  const lessonType = escapeHtml(formatLessonType(lesson.type))

  return [
    '🔔 <b>Yangi dars biriktirildi!</b>',
    '',
    `Assalomu alaykum, <b>${teacher}</b>!`,
    'Sizga dars jadvalida yangi dars biriktirildi:',
    '',
    `👥 <b>Guruh:</b> ${group}`,
    `📚 <b>Fan:</b> ${subject}`,
    `📖 <b>Turi:</b> ${lessonType}`,
    `📅 <b>Kuni:</b> ${fullDate}`,
    `⏰ <b>Vaqti:</b> ${periodStr}`,
    `🚪 <b>Auditoriya:</b> ${room}`,
    `🗓 <b>Hafta:</b> ${lesson.weekStart} haftasi`,
    '',
    '<i>Dars jadvalingizni to‘liq ko‘rish uchun quyidagi tugmadan foydalanishingiz mumkin.</i>',
  ].join('\n')
}

function formatUpdatedMessage(lesson, teacherName) {
  const dayName = DAY_NAMES[lesson.dayOfWeek] || `${lesson.dayOfWeek}-kun`
  const dateStr = formatLessonDate(lesson.weekStart, lesson.dayOfWeek)
  const fullDate = dateStr ? `${dayName} (${dateStr})` : dayName
  const periodTime = PERIOD_TIMES[lesson.period] || ''
  const periodStr = periodTime ? `${lesson.period}-para (${periodTime})` : `${lesson.period}-para`
  const room = lesson.room && String(lesson.room).trim()
    ? escapeHtml(String(lesson.room).trim())
    : 'Ko‘rsatilmagan'
  const group = escapeHtml(formatGroupNames(lesson))
  const subject = escapeHtml(lesson.subject?.name || 'Noma’lum fan')
  const teacher = escapeHtml(teacherName || lesson.teacher?.name || 'O‘qituvchi')
  const lessonType = escapeHtml(formatLessonType(lesson.type))

  return [
    '🔄 <b>Dars jadvali yangilandi!</b>',
    '',
    `Assalomu alaykum, <b>${teacher}</b>!`,
    'Sizga biriktirilgan dars ma’lumotlariga o‘zgartirish kiritildi:',
    '',
    `👥 <b>Guruh:</b> ${group}`,
    `📚 <b>Fan:</b> ${subject}`,
    `📖 <b>Turi:</b> ${lessonType}`,
    `📅 <b>Kuni:</b> ${fullDate}`,
    `⏰ <b>Vaqti:</b> ${periodStr}`,
    `🚪 <b>Auditoriya:</b> ${room}`,
    `🗓 <b>Hafta:</b> ${lesson.weekStart} haftasi`,
    '',
    '<i>Iltimos, yangilangan dars jadvalingiz bilan tanishib chiqing.</i>',
  ].join('\n')
}

function formatDeletedMessage(lesson, teacherName) {
  const dayName = DAY_NAMES[lesson.dayOfWeek] || `${lesson.dayOfWeek}-kun`
  const dateStr = formatLessonDate(lesson.weekStart, lesson.dayOfWeek)
  const fullDate = dateStr ? `${dayName} (${dateStr})` : dayName
  const periodTime = PERIOD_TIMES[lesson.period] || ''
  const periodStr = periodTime ? `${lesson.period}-para (${periodTime})` : `${lesson.period}-para`
  const room = lesson.room && String(lesson.room).trim()
    ? escapeHtml(String(lesson.room).trim())
    : 'Ko‘rsatilmagan'
  const group = escapeHtml(formatGroupNames(lesson))
  const subject = escapeHtml(lesson.subject?.name || 'Noma’lum fan')
  const teacher = escapeHtml(teacherName || lesson.teacher?.name || 'O‘qituvchi')
  const lessonType = escapeHtml(formatLessonType(lesson.type))

  return [
    '❌ <b>Dars bekor qilindi</b>',
    '',
    `Assalomu alaykum, <b>${teacher}</b>!`,
    'Sizga biriktirilgan quyidagi dars jadvaldan olib tashlandi:',
    '',
    `👥 <b>Guruh:</b> ${group}`,
    `📚 <b>Fan:</b> ${subject}`,
    `📖 <b>Turi:</b> ${lessonType}`,
    `📅 <b>Kuni:</b> ${fullDate}`,
    `⏰ <b>Vaqti:</b> ${periodStr}`,
    `🚪 <b>Auditoriya:</b> ${room}`,
    `🗓 <b>Hafta:</b> ${lesson.weekStart} haftasi`,
  ].join('\n')
}

function formatReminderMessage(lesson, minutesBefore = LESSON_REMINDER_MINUTES) {
  const teacher = escapeHtml(lesson.teacher?.name || 'O‘qituvchi')
  const subject = escapeHtml(lesson.subject?.name || 'Noma’lum fan')
  const groups = escapeHtml(formatGroupNames(lesson))
  const room = escapeHtml(String(lesson.room || '').trim()) || 'Ko‘rsatilmagan'
  const day = DAY_NAMES[lesson.dayOfWeek] || ''
  const date = formatLessonDate(lesson.weekStart, lesson.dayOfWeek)

  return [
    '🔔 <b>Dars eslatmasi</b>',
    '',
    `Assalomu alaykum, <b>${teacher}</b>!`,
    `Sizga dars bor — boshlanishiga <b>${minutesBefore} daqiqa</b> qoldi.`,
    '',
    `📚 <b>${subject}</b>`,
    `📖 <b>Dars turi:</b> ${escapeHtml(formatLessonType(lesson.type))}`,
    `⏰ <b>${lesson.period}-para:</b> ${PERIOD_TIMES[lesson.period] || ''}`,
    `👥 <b>Guruh:</b> ${groups}`,
    `🚪 <b>Auditoriya:</b> ${room}`,
    `📅 <b>Bugun:</b> ${day} (${date})`,
    '',
    '<i>Vaqt Toshkent vaqti bilan ko‘rsatilgan. Darsga tayyorlanishni unutmang!</i>',
  ].join('\n')
}

async function notifyTeacherLessonReminder({ lesson, minutesBefore = LESSON_REMINDER_MINUTES, signal }) {
  const teacher = lesson?.teacher
  if (!teacher || teacher.role !== 'teacher' || teacher.isActive !== true || !teacher.telegramId) {
    return false
  }
  return sendToTeacher(teacher, formatReminderMessage(lesson, minutesBefore), getLessonKeyboard(), signal)
}

function getLessonKeyboard() {
  const buttons = [
    [Markup.button.callback('📅 Dars jadvalini ko‘rish', 'schedule:0')],
  ]
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL
  if (webAppUrl) {
    try {
      const base = new URL(webAppUrl)
      if (base.protocol === 'https:') {
        buttons.unshift([Markup.button.webApp('🌐 Jadvalni ochish (Web App)', `${base.origin}/teacher`)])
      }
    } catch {}
  }
  return Markup.inlineKeyboard(buttons)
}

async function sendToTeacher(teacherRef, messageText, keyboard = null, signal = null) {
  const bot = getTelegramBot()
  if (!bot || !teacherRef) return false

  try {
    let telegramId = teacherRef.telegramId
    let teacherName = teacherRef.name

    if (!telegramId) {
      const teacherId = teacherRef._id || teacherRef.id || teacherRef
      const teacherUser = await User.findById(teacherId).select('name telegramId isActive')
      if (!teacherUser || !teacherUser.isActive || !teacherUser.telegramId) {
        return false
      }
      telegramId = teacherUser.telegramId
      teacherName = teacherName || teacherUser.name
    }

    const options = {
      parse_mode: 'HTML',
      ...(keyboard ? keyboard : {}),
    }

    if (signal) {
      await bot.telegram.callApi('sendMessage', { chat_id: telegramId, text: messageText, ...options }, { signal })
    } else {
      await bot.telegram.sendMessage(telegramId, messageText, options)
    }
    console.log(`[TelegramNotification] Notification sent to teacher ${teacherName} (${telegramId})`)
    return true
  } catch (error) {
    console.error('[TelegramNotification] Could not send message to teacher:', error.message)
    return false
  }
}

async function notifyTeacherLesson({ lesson, action = 'created', oldLesson = null }) {
  const bot = getTelegramBot()
  if (!bot || !lesson) return false

  if (action === 'deleted') {
    return sendToTeacher(lesson.teacher, formatDeletedMessage(lesson), null)
  }

  if (action === 'updated' && oldLesson && oldLesson.teacher) {
    const oldTeacherId = (oldLesson.teacher._id || oldLesson.teacher.id || oldLesson.teacher).toString()
    const newTeacherId = (lesson.teacher._id || lesson.teacher.id || lesson.teacher).toString()

    if (oldTeacherId !== newTeacherId) {
      await sendToTeacher(oldLesson.teacher, formatDeletedMessage(oldLesson), null)
      return sendToTeacher(lesson.teacher, formatCreatedMessage(lesson), getLessonKeyboard())
    }
  }

  const message = action === 'updated'
    ? formatUpdatedMessage(lesson)
    : formatCreatedMessage(lesson)

  return sendToTeacher(lesson.teacher, message, getLessonKeyboard())
}

module.exports = {
  setTelegramBot,
  getTelegramBot,
  formatLessonDate,
  formatLessonType,
  LESSON_TYPE_NAMES,
  formatCreatedMessage,
  formatUpdatedMessage,
  formatDeletedMessage,
  formatReminderMessage,
  notifyTeacherLessonReminder,
  LESSON_REMINDER_MINUTES,
  getLessonKeyboard,
  notifyTeacherLesson,
  sendToTeacher,
  PERIOD_TIMES,
  DAY_NAMES,
}
