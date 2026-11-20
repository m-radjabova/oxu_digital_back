const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const User = require('../models/User')
const PasswordReset = require('../models/PasswordReset')
const { getTelegramBot } = require('../services/telegramNotification')
const RESET_MINUTES = 20
const genericMessage = 'Agar faol hisob Telegramga ulangan bo‘lsa, tiklash havolasi o‘sha Telegramga yuborildi.'
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex')

async function requestPasswordReset(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ message: 'To‘g‘ri email manzilini kiriting.' })
  const bot = getTelegramBot()
  const configuredUrl = (process.env.FRONTEND_URL || '').split(',')[0]?.trim()
  let base
  try { base = new URL(configuredUrl); if (!['https:', 'http:'].includes(base.protocol)) throw new Error() } catch { return res.status(503).json({ message: 'Parolni tiklash xizmati sozlanmagan. Administratorga murojaat qiling.' }) }
  if (!bot) return res.status(503).json({ message: 'Telegram xizmati hozir ishlamayapti. Keyinroq urinib ko‘ring.' })
  const user = await User.findOne({ email, isActive: true }).select('telegramId').lean()
  if (user?.telegramId) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = digest(token)
    await PasswordReset.findOneAndUpdate({ user: user._id }, { tokenHash, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) }, { upsert: true, runValidators: true })
    const link = new URL('/reset-password', base); link.searchParams.set('token', token)
    try { await bot.telegram.sendMessage(user.telegramId, `OXU Digital parolini tiklash\n\nYangi parol o‘rnatish uchun havolani oching:\n${link.toString()}\n\nHavola ${RESET_MINUTES} daqiqa amal qiladi va faqat bir marta ishlatiladi. Agar siz so‘ramagan bo‘lsangiz, ushbu xabarni e’tiborsiz qoldiring.`) }
    catch (error) { await PasswordReset.deleteOne({ user: user._id, tokenHash }); console.error('[PasswordReset] Telegram delivery failed:', error.message) }
  }
  res.json({ message: genericMessage })
}
async function resetPassword(req, res) {
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'Havola noto‘g‘ri yoki muddati tugagan.' })
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'Parol kamida 8 belgidan va ko‘pi bilan 72 baytdan iborat bo‘lsin.' })
  const hash = await bcrypt.hash(password, 12)
  const session = await mongoose.startSession()
  let userId = null
  try {
    await session.withTransaction(async () => {
      const record = await PasswordReset.findOneAndDelete({ tokenHash: digest(token), expiresAt: { $gt: new Date() } }, { session })
      if (!record) return
      const user = await User.findOneAndUpdate({ _id: record.user, isActive: true }, { $set: { password: hash }, $inc: { tokenVersion: 1 } }, { session, new: true })
      if (user) userId = user._id.toString()
    })
  } finally { await session.endSession() }
  if (!userId) return res.status(400).json({ message: 'Havola noto‘g‘ri, ishlatilgan yoki muddati tugagan.' })
  req.app.locals.io?.in(`user:${userId}`).disconnectSockets(true)
  res.json({ message: 'Parol yangilandi. Yangi parol bilan tizimga kiring.' })
}
module.exports = { requestPasswordReset, resetPassword, digest }
