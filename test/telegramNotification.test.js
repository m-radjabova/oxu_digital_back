const test = require('node:test')
const assert = require('node:assert/strict')
const {
  formatLessonDate,
  formatCreatedMessage,
  formatUpdatedMessage,
  formatDeletedMessage,
  formatReminderMessage,
  notifyTeacherLessonReminder,
  notifyTeacherLesson,
  setTelegramBot,
} = require('../services/telegramNotification')

test('formats lesson date correctly in Uzbek', () => {
  // 2026-11-16 is Monday (dayOfWeek: 1)
  const mondayDate = formatLessonDate('2026-11-16', 1)
  assert.equal(mondayDate, '16-noyabr, 2026')

  // Wednesday (dayOfWeek: 3)
  const wednesdayDate = formatLessonDate('2026-11-16', 3)
  assert.equal(wednesdayDate, '18-noyabr, 2026')
})

test('formats created lesson message with all details', () => {
  const lesson = {
    groups: [{ name: 'TATU-201' }],
    subject: { name: 'Matematika' },
    teacher: { name: 'Ali Valiyev', telegramId: '12345678' },
    dayOfWeek: 1,
    period: 2,
    weekStart: '2026-11-16',
    room: '304-xona',
  }

  const message = formatCreatedMessage(lesson)
  assert.match(message, /Yangi dars biriktirildi/)
  assert.match(message, /Ali Valiyev/)
  assert.match(message, /TATU-201/)
  assert.match(message, /Matematika/)
  assert.match(message, /Dushanba \(16-noyabr, 2026\)/)
  assert.match(message, /2-para \(10:00 — 11:20\)/)
  assert.match(message, /304-xona/)
})

test('formats updated lesson message', () => {
  const lesson = {
    groups: [{ name: 'TATU-201' }],
    subject: { name: 'Fizika' },
    teacher: { name: 'Hasan Husanov' },
    dayOfWeek: 4,
    period: 3,
    weekStart: '2026-11-16',
    room: '',
  }

  const message = formatUpdatedMessage(lesson)
  assert.match(message, /Dars jadvali yangilandi/)
  assert.match(message, /Payshanba \(19-noyabr, 2026\)/)
  assert.match(message, /3-para \(11:30 — 12:50\)/)
  assert.match(message, /Ko‘rsatilmagan/)
})

test('formats combined lecture groups in the notification', () => {
  const lesson = {
    groups: [{ name: 'TATU-201' }, { name: 'TATU-202' }, { name: 'TATU-203' }],
    type: 'lecture',
    subject: { name: 'Fizika' },
    teacher: { name: 'Hasan Husanov' },
    dayOfWeek: 4,
    period: 3,
    weekStart: '2026-11-16',
    room: 'Amfiteatr-1',
  }

  const message = formatCreatedMessage(lesson)
  assert.match(message, /TATU-201, TATU-202, TATU-203/)
  assert.match(message, /Ma’ruza/)
})

test('formats practice and lab lesson types correctly in messages', () => {
  const practiceLesson = {
    groups: [{ name: 'TATU-201' }],
    type: 'practice',
    subject: { name: 'Dasturlash' },
    teacher: { name: 'Ali Valiyev' },
    dayOfWeek: 2,
    period: 1,
    weekStart: '2026-11-16',
  }
  const labLesson = {
    groups: [{ name: 'TATU-201' }],
    type: 'lab',
    subject: { name: 'Tarmoqlar' },
    teacher: { name: 'Vali Aliyev' },
    dayOfWeek: 3,
    period: 2,
    weekStart: '2026-11-16',
  }

  const practiceMsg = formatCreatedMessage(practiceLesson)
  assert.match(practiceMsg, /Amaliyot/)

  const labMsg = formatCreatedMessage(labLesson)
  assert.match(labMsg, /Laboratoriya/)

  const deletedPracticeMsg = formatDeletedMessage(practiceLesson)
  assert.match(deletedPracticeMsg, /Amaliyot/)
})

test('formats deleted lesson message', () => {
  const lesson = {
    groups: [{ name: 'TATU-201' }],
    subject: { name: 'Tarix' },
    teacher: { name: 'Olim Olimov' },
    dayOfWeek: 2,
    period: 1,
    weekStart: '2026-11-16',
  }

  const message = formatDeletedMessage(lesson)
  assert.match(message, /Dars bekor qilindi/)
  assert.match(message, /Seshanba \(17-noyabr, 2026\)/)
  assert.match(message, /1-para \(08:30 — 09:50\)/)
})

test('notifyTeacherLesson sends message via bot when teacher has telegramId', async () => {
  let sentPayload = null
  const mockBot = {
    telegram: {
      sendMessage: async (chatId, text, options) => {
        sentPayload = { chatId, text, options }
        return { message_id: 1 }
      },
    },
  }

  setTelegramBot(mockBot)

  const lesson = {
    groups: [{ name: 'TATU-201' }],
    subject: { name: 'Informatika' },
    teacher: { name: 'Aziz Rahimov', telegramId: '987654321' },
    dayOfWeek: 5,
    period: 4,
    weekStart: '2026-11-16',
    room: 'Lab-2',
  }

  const result = await notifyTeacherLesson({ lesson, action: 'created' })
  assert.equal(result, true)
  assert.equal(sentPayload.chatId, '987654321')
  assert.match(sentPayload.text, /Aziz Rahimov/)
  assert.match(sentPayload.text, /Informatika/)
  assert.match(sentPayload.text, /Juma \(20-noyabr, 2026\)/)
  assert.match(sentPayload.text, /4-para \(13:30 — 14:50\)/)
  assert.equal(sentPayload.options.parse_mode, 'HTML')
})

test('notifyTeacherLesson returns false and does not fail when bot is not set', async () => {
  setTelegramBot(null)

  const lesson = {
    groups: [{ name: 'TATU-201' }],
    subject: { name: 'Informatika' },
    teacher: { name: 'Aziz Rahimov', telegramId: '987654321' },
    dayOfWeek: 5,
    period: 4,
    weekStart: '2026-11-16',
  }

  const result = await notifyTeacherLesson({ lesson, action: 'created' })
  assert.equal(result, false)
})

test('formats a ten-minute reminder with escaped lesson details and all groups', () => {
  const message = formatReminderMessage({
    teacher: { name: 'Ali <Vali>' },
    subject: { name: 'Matematika & statistika' },
    groups: [{ name: 'DEMO-G10' }, { name: 'DEMO-G11' }],
    type: 'practice',
    period: 2,
    dayOfWeek: 2,
    weekStart: '2026-11-16',
    room: '4-bino <703>-xona',
  })
  assert.match(message, /🔔 <b>Dars eslatmasi<\/b>/)
  assert.match(message, /Sizga dars bor.*<b>10 daqiqa<\/b>/)
  assert.match(message, /Ali &lt;Vali&gt;/)
  assert.match(message, /Matematika &amp; statistika/)
  assert.match(message, /DEMO-G10, DEMO-G11/)
  assert.match(message, /Amaliyot/)
  assert.match(message, /2-para.*10:00 — 11:20/)
  assert.match(message, /4-bino &lt;703&gt;-xona/)
  assert.match(message, /Seshanba \(17-noyabr, 2026\)/)
  assert.match(message, /Toshkent/)
  assert.doesNotMatch(message, /<Vali>|<703>/)
})

test('reminder fallbacks and catch-up countdown are clear', () => {
  const message = formatReminderMessage({ period: 1, dayOfWeek: 1, weekStart: '2026-11-16' }, 7)
  assert.match(message, /<b>7 daqiqa<\/b>/)
  assert.match(message, /O‘qituvchi/)
  assert.match(message, /Noma’lum fan/)
  assert.match(message, /Noma’lum guruh/)
  assert.match(message, /Ko‘rsatilmagan/)
})

test('reminder sends HTML with schedule buttons and a bounded API request', async (t) => {
  t.after(() => setTelegramBot(null))
  const calls = []
  setTelegramBot({ telegram: {
    callApi: async (method, payload, options) => {
      calls.push({ method, payload, options })
      return { message_id: 1 }
    },
  } })
  const signal = new AbortController().signal
  const lesson = {
    teacher: { name: 'Ali', telegramId: '123', role: 'teacher', isActive: true },
    subject: { name: 'Matematika' },
    groups: [{ name: 'DEMO-G10' }],
    period: 2,
    dayOfWeek: 2,
    weekStart: '2026-11-16',
  }
  assert.equal(await notifyTeacherLessonReminder({ lesson, signal }), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'sendMessage')
  assert.equal(calls[0].payload.chat_id, '123')
  assert.equal(calls[0].payload.parse_mode, 'HTML')
  assert.equal(calls[0].payload.reply_markup.inline_keyboard.at(-1)[0].callback_data, 'schedule:0')
  assert.equal(calls[0].options.signal, signal)
})

test('reminders exclude students, inactive teachers, and unlinked teachers', async (t) => {
  t.after(() => setTelegramBot(null))
  let calls = 0
  setTelegramBot({ telegram: { sendMessage: async () => { calls += 1 } } })
  for (const teacher of [
    null,
    { role: 'student', isActive: true, telegramId: '123' },
    { role: 'teacher', isActive: false, telegramId: '123' },
    { role: 'teacher', isActive: true },
  ]) {
    assert.equal(await notifyTeacherLessonReminder({ lesson: { teacher } }), false)
  }
  assert.equal(calls, 0)
})
