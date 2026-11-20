const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { verifyTelegramWebAppData } = require('../utils/telegramWebApp')

function publicUser(user) {
  const payload = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    group: user.group || null,
    isActive: user.isActive !== false,
  }
  // O‘qituvchiga biriktirilgan fanlar (hisob yaratishda tanlanadi).
  if (user.role === 'teacher') {
    payload.subjectIds = (user.subjects || []).map((subjectId) => subjectId.toString())
    payload.directionIds = (user.directions || []).map((directionId) => directionId.toString())
  }
  return payload
}

async function login(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return res.status(400).json({ message: 'Email va parolni kiriting.' })
  }

  const user = await User.findOne({ email }).select('+password').populate('group', 'name')
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Email yoki parol noto‘g‘ri.' })
  }

  res.json({ token: signAccessToken(user), user: publicUser(user) })
}

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, ver: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  })
}

async function telegramWebAppLogin(req, res) {
  const initData = typeof req.body?.initData === 'string' ? req.body.initData : ''
  const telegramUser = verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN)
  if (!telegramUser) {
    return res.status(401).json({ message: 'Telegram sessiyasi yaroqsiz yoki muddati tugagan.' })
  }

  const user = await User.findOne({
    telegramId: String(telegramUser.id),
    isActive: true,
  }).populate('group', 'name')
  if (!user) {
    return res.status(403).json({ message: 'Avval OXU profilingizdan Telegram botni ulang.' })
  }

  res.json({
    token: signAccessToken(user),
    user: publicUser(user),
    telegramUserId: String(telegramUser.id),
  })
}

async function changePassword(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!currentPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Joriy parolni kiriting va yangi parol kamida 8 belgidan iborat bo‘lsin.' })
  }

  const user = await User.findById(req.user._id).select('+password')
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Hisob faol emas yoki topilmadi.' })
  }
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ message: 'Joriy parol noto‘g‘ri.' })
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(400).json({ message: 'Yangi parol joriy paroldan farq qilishi kerak.' })
  }

  user.password = await bcrypt.hash(newPassword, 12)
  await user.save()
  res.json({ message: 'Parol muvaffaqiyatli yangilandi.' })
}

function me(req, res) {
  res.json(publicUser(req.user))
}

module.exports = { login, telegramWebAppLogin, changePassword, me, publicUser }
