const jwt = require('jsonwebtoken')
const { Markup, Telegraf, session } = require('telegraf')
const User = require('../models/User')
const { linkTelegramAccount } = require('./telegramLink')
const { setTelegramBot, formatLessonType } = require('./telegramNotification')

const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const DAY_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh']
const PERIOD_COUNT = 8
const ROLE_NAMES = { admin: 'Administrator', teacher: 'O‘qituvchi', student: 'Talaba' }

function dateKey(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function weekStart(offset = 0) {
  const monday = new Date()
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7)
  return dateKey(monday)
}

function displayDate(value) {
  return new Intl.DateTimeFormat('uz-UZ', { day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`))
}

function apiUrl(app, path) {
  return new URL(path, app.locals.telegramApiBaseUrl).toString()
}

async function apiRequest(app, user, path, options = {}) {
  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '2m' },
  )
  const response = await fetch(apiUrl(app, path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const text = response.status === 204 ? '' : await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data?.message || `Server xatosi (${response.status}).`)
  }
  return data
}

async function findTelegramUser(ctx) {
  if (!ctx.from) return null
  return User.findOne({ telegramId: String(ctx.from.id), isActive: true })
    .populate('group', 'name')
}

function webAppMarkup(pathname = '/') {
  const configuredUrl = process.env.TELEGRAM_WEB_APP_URL
  if (!configuredUrl) return null
  try {
    const base = new URL(configuredUrl)
    if (base.protocol !== 'https:') return null
    const url = new URL(pathname.replace(/^\//, ''), `${base.toString().replace(/\/+$/, '')}/`)
    return Markup.keyboard([
      [Markup.button.webApp('🌐 OXU Web App', url.toString())],
    ]).resize()
  } catch {
    return null
  }
}

async function showHome(ctx, user) {
  const buttons = [
    [Markup.button.callback('📅 Dars jadvali', 'schedule:0')],
  ]
  if (user.role === 'teacher') {
    buttons.push([Markup.button.callback('🟡 Band vaqtlar', 'availability:0')])
    buttons.push([Markup.button.callback('✅ Davomat olish', 'attendance')])
  } else if (user.role === 'student') {
    buttons.push([Markup.button.callback('📋 Davomat natijalari', 'attendance')])
  } else {
    buttons.push([Markup.button.callback('🗓 O‘qituvchi jadvali', 'admin:schedule')])
    buttons.push([
      Markup.button.callback('Hisoblar', 'admin:accounts'),
      Markup.button.callback('Guruhlar', 'admin:groups'),
      Markup.button.callback('Fanlar', 'admin:subjects'),
    ])
  }
  await ctx.reply(
    `Assalomu alaykum, ${user.name}!\nRol: ${ROLE_NAMES[user.role]}. Kerakli bo‘limni tanlang.`,
    Markup.inlineKeyboard(buttons),
  )

  const keyboard = webAppMarkup(`/${user.role}`)
  if (keyboard) {
    await ctx.reply('Saytning barcha imkoniyatlarini Telegram ichida ochish:', keyboard)
  }
}

function scheduleWeekKeyboard(offset) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('‹ Oldingi hafta', `schedule:${offset - 1}`),
      Markup.button.callback('Keyingi hafta ›', `schedule:${offset + 1}`),
    ],
    [Markup.button.callback('Menyu', 'home')],
  ])
}

function formatGroupNames(lesson) {
  const names = (lesson.groups || []).map((group) => group.name).filter(Boolean)
  return names.length ? names.join(', ') : 'Guruh noma’lum'
}

function groupLessonsByDay(lessons) {
  return DAYS.map((dayName, index) => {
    const dayLessons = lessons
      .filter((lesson) => lesson.dayOfWeek === index + 1)
      .sort((left, right) => left.period - right.period)
    if (!dayLessons.length) return `${dayName}: dars yo‘q`
    return `${dayName}:\n${dayLessons.map((lesson) => {
      const type = ` (${formatLessonType(lesson.type)})`
      const owner = lesson.groups?.length ? ` · ${formatGroupNames(lesson)}` : ''
      const teacher = lesson.teacher?.name ? ` · ${lesson.teacher.name}` : ''
      return `  ${lesson.period}-para — ${lesson.subject.name}${type}${owner}${teacher}`
    }).join('\n')}`
  }).join('\n\n')
}

async function showSchedule(ctx, user, offset = 0, teacherId) {
  if (user.role === 'admin' && !teacherId) {
    return adminSection(ctx, user, 'schedule')
  }
  const selectedWeek = weekStart(offset)
  const params = new URLSearchParams({ weekStart: selectedWeek })
  if (teacherId) params.set('teacherId', teacherId)
  const lessons = await apiRequest(ctx.app, user, `/lessons?${params}`)
  const teacherName = teacherId ? `\nO‘qituvchi jadvali` : ''
  await ctx.reply(
    `${displayDate(selectedWeek)} haftasi${teacherName}\n\n${lessons.length ? groupLessonsByDay(lessons) : 'Bu haftada darslar rejalashtirilmagan.'}`,
    scheduleWeekKeyboard(offset),
  )
}

function localTodayInfo() {
  const today = new Date()
  const dayOfWeek = today.getDay() || 7
  return { date: dateKey(today), dayOfWeek }
}

function studentStatusLabel(status) {
  return status === 'present' ? 'Keldi' : 'Kelmadi'
}

async function showAttendance(ctx, user) {
  if (user.role === 'student') {
    const records = await apiRequest(ctx.app, user, '/attendance/me')
    const items = records.slice(0, 12).map((record) => {
      const typeLabel = formatLessonType(record.lesson?.type)
      return `${record.date} · ${record.lesson.subject.name} (${typeLabel}), ${record.lesson.period}-para — ${studentStatusLabel(record.status)}`
    })
    await ctx.reply(
      items.length ? `Davomat natijalari:\n\n${items.join('\n')}` : 'Hozircha davomat natijalari yo‘q.',
      Markup.inlineKeyboard([[Markup.button.callback('Menyu', 'home')]]),
    )
    return
  }

  if (user.role !== 'teacher') {
    await ctx.reply('Davomat bo‘limi faqat o‘qituvchi va talabalar uchun.')
    return
  }

  const { date, dayOfWeek } = localTodayInfo()
  if (dayOfWeek > 6) {
    await ctx.reply('Yakshanba kuni jadval bo‘yicha dars yo‘q.')
    return
  }
  const lessons = await apiRequest(ctx.app, user, `/lessons?weekStart=${weekStart()}`)
  const todayLessons = lessons.filter((lesson) => lesson.dayOfWeek === dayOfWeek)
  if (!todayLessons.length) {
    await ctx.reply('Bugun sizga dars biriktirilmagan.')
    return
  }
  await ctx.reply(
    `Bugungi dars uchun davomatni tanlang (${date}):`,
    Markup.inlineKeyboard([
      ...todayLessons.map((lesson) => [
        Markup.button.callback(
          `${lesson.period}-para · ${lesson.subject.name} (${formatLessonType(lesson.type)}) · ${formatGroupNames(lesson)}`,
          `attendance:lesson:${lesson.id}:${date}`,
        ),
      ]),
      [Markup.button.callback('Menyu', 'home')],
    ]),
  )
}

function attendanceKeyboard(draft) {
  const rows = draft.entries.map((entry, index) => {
    const studentName = entry.name.length > 18 ? `${entry.name.slice(0, 17)}…` : entry.name
    return [
      Markup.button.callback(
        `${entry.status === 'present' ? '✅' : '▫️'} ${studentName} keldi`,
        `attendance:student:${index}:present`,
      ),
      Markup.button.callback(
        `${entry.status === 'absent' ? '❌' : '▫️'} ${studentName} kelmadi`,
        `attendance:student:${index}:absent`,
      ),
    ]
  })
  const allMarked = draft.entries.every(({ status }) => status)
  if (allMarked) rows.push([Markup.button.callback('Davomatni saqlash', 'attendance:save')])
  return Markup.inlineKeyboard(rows)
}

async function beginAttendance(ctx, user, lessonId, date) {
  const details = await apiRequest(
    ctx.app,
    user,
    `/attendance/lessons/${lessonId}?date=${encodeURIComponent(date)}`,
  )
  if (details.attendance) {
    const taken = details.attendance.entries.map(({ student, status }) =>
      `${student?.name || 'Talaba'} — ${studentStatusLabel(status)}`,
    )
    await ctx.reply(
      `Davomat avval olingan (${date}) va o‘zgartirib bo‘lmaydi:\n\n${taken.join('\n')}`,
    )
    return
  }
  if (!details.students.length) {
    await ctx.reply('Guruhda faol talaba yo‘q.')
    return
  }
  ctx.session.attendanceDraft = {
    lessonId,
    date,
    entries: details.students.map((student) => ({
      studentId: student.id,
      name: student.name,
      status: '',
    })),
  }
  const typeLabel = formatLessonType(details.lesson.type)
  await ctx.reply(
    `${details.lesson.subject.name} (${typeLabel}) · ${details.lesson.groups.map((group) => group.name).join(', ')}\n${date} — har bir talabaning holatini belgilang:`,
    attendanceKeyboard(ctx.session.attendanceDraft),
  )
}

async function renderBusySlots(ctx, user, offset = 0, edit = false) {
  const selectedWeek = weekStart(offset)
  const params = new URLSearchParams({ weekStart: selectedWeek })
  const [slots, lessons] = await Promise.all([
    apiRequest(ctx.app, user, `/teacher-availability?${params}`),
    apiRequest(ctx.app, user, `/lessons?weekStart=${selectedWeek}`),
  ])
  const busy = new Set(slots.map((slot) => `${slot.dayOfWeek}:${slot.period}`))
  const hasLesson = new Set(lessons.map((lesson) => `${lesson.dayOfWeek}:${lesson.period}`))
  const rows = [
    [
      Markup.button.callback('‹ Hafta', `availability:${offset - 1}`),
      Markup.button.callback('Hafta ›', `availability:${offset + 1}`),
    ],
  ]
  for (let day = 1; day <= 6; day += 1) {
    for (let period = 1; period <= PERIOD_COUNT; period += 4) {
      rows.push(Array.from({ length: 4 }, (_value, index) => {
        const currentPeriod = period + index
        const key = `${day}:${currentPeriod}`
        const state = hasLesson.has(key) ? '📚' : busy.has(key) ? '🟡' : '▫️'
        return Markup.button.callback(
          `${DAY_SHORT[day - 1]} ${currentPeriod} ${state}`,
          `availability:toggle:${offset}:${day}:${currentPeriod}`,
        )
      }))
    }
  }
  rows.push([Markup.button.callback('Menyu', 'home')])
  const message = `${displayDate(selectedWeek)} haftasi\n📚 — dars bor · 🟡 — band · ▫️ — bo‘sh\nBo‘sh katakni bosing; band katakni qayta bosing — bekor qilinadi.`
  if (edit) {
    await ctx.editMessageText(message, Markup.inlineKeyboard(rows))
  } else {
    await ctx.reply(message, Markup.inlineKeyboard(rows))
  }
}

async function adminSection(ctx, user, section) {
  const webPath = {
    accounts: '/admin/accounts',
    groups: '/admin/groups',
    subjects: '/admin/subjects',
    schedule: '/admin/schedule',
  }[section]

  if (section === 'schedule') {
    const result = await apiRequest(ctx.app, user, '/users?role=teacher&page=1&limit=15')
    const teachers = result.items || []
    await ctx.reply(
      teachers.length ? 'Jadvalini ko‘rish uchun o‘qituvchini tanlang:' : 'Hozircha o‘qituvchi hisobi yo‘q.',
      Markup.inlineKeyboard([
        ...teachers.map((teacher) => [
          Markup.button.callback(teacher.name, `admin:teacher:${teacher.id}:0`),
        ]),
      ]),
    )
  } else {
    const path = section === 'accounts'
      ? '/users?page=1&limit=15'
      : `/${section}`
    const result = await apiRequest(ctx.app, user, path)
    const items = section === 'accounts' ? result.items || [] : result
    const summary = items.slice(0, 15).map((item) => {
      if (section === 'accounts') return `${item.name} · ${ROLE_NAMES[item.role] || item.role}`
      if (section === 'groups') return `${item.name} · ${item.year}-kurs`
      return `${item.name}`
    })
    await ctx.reply(
      `${section === 'accounts' ? 'Hisoblar' : section === 'groups' ? 'Guruhlar' : 'Fanlar'}:\n\n${summary.length ? summary.join('\n') : 'Ro‘yxat bo‘sh.'}`,
    )
  }

  const keyboard = webAppMarkup(webPath)
  if (keyboard) await ctx.reply('Bo‘limni boshqarish uchun web ilovani oching:', keyboard)
}

async function showAdminTeacherSchedule(ctx, user, teacherId, offset = 0) {
  const teacher = await apiRequest(ctx.app, user, `/users?role=teacher&page=1&limit=15`)
  const selected = (teacher.items || []).find((item) => item.id === teacherId)
  if (!selected) {
    await ctx.reply('O‘qituvchi topilmadi yoki ro‘yxat yangilangan.')
    return
  }
  await ctx.reply(
    `${selected.name}\n${displayDate(weekStart(offset))} haftasi\n\n${groupLessonsByDay(await apiRequest(
      ctx.app,
      user,
      `/lessons?teacherId=${teacherId}&weekStart=${weekStart(offset)}`,
    ))}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('‹ Hafta', `admin:teacher:${teacherId}:${offset - 1}`),
        Markup.button.callback('Hafta ›', `admin:teacher:${teacherId}:${offset + 1}`),
      ],
      [Markup.button.callback('Menyu', 'home')],
    ]),
  )
  const keyboard = webAppMarkup('/admin/schedule')
  if (keyboard) await ctx.reply('Jadvalni qo‘shish yoki tahrirlash:', keyboard)
}

function isPrivateChat(ctx) {
  return ctx.chat?.type === 'private'
}

async function replyUnlinked(ctx) {
  await ctx.reply('Avval saytga kirib Profil → “Telegram botga ulash” tugmasini bosing.')
}

async function startTelegramBot(app) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('Telegram bot not started: TELEGRAM_BOT_TOKEN is not configured.')
    return null
  }
  if (!process.env.JWT_SECRET) {
    console.error('Telegram bot not started: JWT_SECRET is required.')
    return null
  }

  const bot = new Telegraf(token)
  bot.use(session())
  bot.use((ctx, next) => {
    ctx.app = app
    if (ctx.chat && ctx.chat.type !== 'private') {
      return ctx.reply('Bot bilan shaxsiy chatda ishlang.')
    }
    return next()
  })
  bot.catch(async (error, ctx) => {
    console.error('Telegram bot request failed:', error.message)
    if (ctx?.chat) await ctx.reply(`So‘rov bajarilmadi: ${error.message}`)
  })

  bot.start(async (ctx) => {
    if (!isPrivateChat(ctx)) return ctx.reply('Bot bilan shaxsiy chatda ishlang.')
    if (ctx.startPayload) {
      const result = await linkTelegramAccount(String(ctx.from.id), ctx.startPayload)
      if (result.error === 'telegram_already_linked') {
        return ctx.reply('Bu Telegram akkaunti boshqa OXU profiliga ulangan.')
      }
      if (result.error === 'account_already_linked') {
        return ctx.reply('Bu OXU profili boshqa Telegram akkauntiga ulangan. Saytdan avval uzib qo‘ying.')
      }
      if (result.error) {
        return ctx.reply('Ulanish havolasi eskirgan yoki yaroqsiz. Saytdan yangi havola oling.')
      }
      await ctx.reply(`Telegram akkauntingiz ${result.user.name} profili bilan ulandi.`)
      return showHome(ctx, result.user)
    }
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    return showHome(ctx, user)
  })

  bot.command('menu', async (ctx) => {
    if (!isPrivateChat(ctx)) return
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    return showHome(ctx, user)
  })

  bot.command('unlink', async (ctx) => {
    if (!ctx.from) return
    const user = await User.findOne({ telegramId: String(ctx.from.id) })
    if (!user) return ctx.reply('Telegram akkauntingiz ulangan emas.')
    await User.updateOne({ _id: user._id }, { $unset: { telegramId: 1 } })
    return ctx.reply('Telegram akkaunti OXU profilidan uzildi.')
  })

  bot.command('schedule', async (ctx) => {
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    if (user.role === 'admin') return adminSection(ctx, user, 'schedule')
    return showSchedule(ctx, user)
  })

  bot.command('availability', async (ctx) => {
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    if (user.role !== 'teacher') return ctx.reply('Band vaqtlarni faqat o‘qituvchi belgilashi mumkin.')
    return renderBusySlots(ctx, user)
  })

  bot.command('attendance', async (ctx) => {
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    return showAttendance(ctx, user)
  })

  bot.action('home', async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    return showHome(ctx, user)
  })

  bot.action(/^schedule:(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    return showSchedule(ctx, user, Number(ctx.match[1]))
  })

  bot.action(/^availability:(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    if (user.role !== 'teacher') return ctx.reply('Band vaqtlarni faqat o‘qituvchi belgilashi mumkin.')
    return renderBusySlots(ctx, user, Number(ctx.match[1]))
  })

  bot.action(/^availability:toggle:(-?\d+):([1-6]):([1-8])$/, async (ctx) => {
    const user = await findTelegramUser(ctx)
    if (!user) {
      await ctx.answerCbQuery('Avval Telegram akkauntingizni ulang.', { show_alert: true })
      return
    }
    if (user.role !== 'teacher') {
      await ctx.answerCbQuery('Bu amal faqat o‘qituvchilar uchun.', { show_alert: true })
      return
    }

    const offset = Number(ctx.match[1])
    const dayOfWeek = Number(ctx.match[2])
    const period = Number(ctx.match[3])
    const selectedWeek = weekStart(offset)
    const params = new URLSearchParams({ weekStart: selectedWeek })
    const [slots, lessons] = await Promise.all([
      apiRequest(ctx.app, user, `/teacher-availability?${params}`),
      apiRequest(ctx.app, user, `/lessons?weekStart=${selectedWeek}`),
    ])
    if (lessons.some((lesson) => lesson.dayOfWeek === dayOfWeek && lesson.period === period)) {
      await ctx.answerCbQuery('Bu vaqtda dars bor.', { show_alert: true })
      return
    }

    const current = slots.find((slot) => slot.dayOfWeek === dayOfWeek && slot.period === period)
    if (current) {
      await apiRequest(ctx.app, user, `/teacher-availability/${current.id}`, { method: 'DELETE' })
    } else {
      await apiRequest(ctx.app, user, '/teacher-availability', {
        method: 'POST',
        body: JSON.stringify({ weekStart: selectedWeek, dayOfWeek, period }),
      })
    }
    await ctx.answerCbQuery(current ? 'Bandlik bekor qilindi.' : 'Para band qilib belgilandi.')
    return renderBusySlots(ctx, user, offset, true)
  })

  bot.action('attendance', async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    return showAttendance(ctx, user)
  })

  bot.action(/^attendance:lesson:([a-f\d]{24}):(\d{4}-\d{2}-\d{2})$/i, async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    if (user.role !== 'teacher') return ctx.reply('Davomatni faqat o‘qituvchi olishi mumkin.')
    return beginAttendance(ctx, user, ctx.match[1], ctx.match[2])
  })

  bot.action(/^attendance:student:(\d+):(present|absent)$/, async (ctx) => {
    const draft = ctx.session.attendanceDraft
    const index = Number(ctx.match[1])
    if (!draft || !draft.entries[index]) {
      await ctx.answerCbQuery('Davomat oynasi eskirgan. /attendance buyrug‘ini qayta yuboring.', { show_alert: true })
      return
    }
    draft.entries[index].status = ctx.match[2]
    await ctx.answerCbQuery()
    return ctx.editMessageReplyMarkup(attendanceKeyboard(draft).reply_markup)
  })

  bot.action('attendance:save', async (ctx) => {
    const user = await findTelegramUser(ctx)
    const draft = ctx.session.attendanceDraft
    if (!user || user.role !== 'teacher') {
      await ctx.answerCbQuery('O‘qituvchi akkaunti topilmadi.', { show_alert: true })
      return
    }
    if (!draft || draft.entries.some(({ status }) => !status)) {
      await ctx.answerCbQuery('Avval barcha talabalar holatini belgilang.', { show_alert: true })
      return
    }
    await apiRequest(ctx.app, user, `/attendance/lessons/${draft.lessonId}`, {
      method: 'POST',
      body: JSON.stringify({
        date: draft.date,
        entries: draft.entries.map(({ studentId, status }) => ({ studentId, status })),
      }),
    })
    ctx.session.attendanceDraft = null
    await ctx.answerCbQuery('Davomat saqlandi.')
    return ctx.editMessageText('Davomat saqlandi. Uni qayta tahrirlab bo‘lmaydi.')
  })

  bot.action(/^admin:(schedule|accounts|groups|subjects)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    if (user.role !== 'admin') return ctx.reply('Bu bo‘lim faqat administrator uchun.')
    return adminSection(ctx, user, ctx.match[1])
  })

  bot.action(/^admin:teacher:([a-f\d]{24}):(-?\d+)$/i, async (ctx) => {
    await ctx.answerCbQuery()
    const user = await findTelegramUser(ctx)
    if (!user) return replyUnlinked(ctx)
    if (user.role !== 'admin') return ctx.reply('Bu bo‘lim faqat administrator uchun.')
    return showAdminTeacherSchedule(ctx, user, ctx.match[1], Number(ctx.match[2]))
  })

  const botInfo = await bot.telegram.getMe()
  setTelegramBot(bot)
  app.locals.telegramBot = bot
  app.locals.telegramBotUsername = botInfo.username
  console.log(`Telegram bot @${botInfo.username} is running.`)
  void bot.launch().catch((error) => {
    console.error('Unable to launch Telegram polling:', error.message)
  })
  return bot
}

module.exports = startTelegramBot
