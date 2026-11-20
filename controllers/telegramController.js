const { createTelegramLinkCode } = require('../services/telegramLink')
const User = require('../models/User')
const { LESSON_REMINDER_MINUTES } = require('../services/telegramNotification')
const { REMINDER_TIME_ZONE } = require('../services/telegramLessonReminder')

function getBotUsername(req) {
  return req.app.locals.telegramBotUsername || ''
}

function getTelegramStatus(req, res) {
  const username = getBotUsername(req)
  res.json({
    linked: Boolean(req.user.telegramId),
    botUrl: username ? `https://t.me/${username}` : null,
    lessonReminder: {
      enabled: Boolean(req.user.telegramId && req.user.role === 'teacher' && req.app.locals.telegramLessonRemindersRunning),
      minutesBefore: LESSON_REMINDER_MINUTES,
      timeZone: REMINDER_TIME_ZONE,
    },
  })
}

async function createLinkCode(req, res) {
  if (req.user.telegramId) {
    return res.status(409).json({ message: 'Telegram akkaunti allaqachon ulangan.' })
  }

  const username = getBotUsername(req)
  if (!username) {
    return res.status(503).json({ message: 'Telegram bot hozircha ishga tushmagan.' })
  }

  const { token, expiresAt } = await createTelegramLinkCode(req.user._id)
  res.status(201).json({
    url: `https://t.me/${username}?start=${token}`,
    expiresAt,
  })
}

async function unlinkTelegram(req, res) {
  await User.updateOne({ _id: req.user._id }, { $unset: { telegramId: 1 } })
  res.status(204).end()
}

module.exports = { createLinkCode, getTelegramStatus, unlinkTelegram }
