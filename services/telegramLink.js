const { createHash, randomBytes } = require('node:crypto')
const TelegramLinkCode = require('../models/TelegramLinkCode')
const User = require('../models/User')

const LINK_CODE_TTL_MS = 15 * 60 * 1000

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function createTelegramLinkCode(userId) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS)
  await TelegramLinkCode.deleteMany({ user: userId })
  await TelegramLinkCode.create({ user: userId, tokenHash: hashToken(token), expiresAt })
  return { token, expiresAt }
}

async function linkTelegramAccount(telegramId, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return { error: 'invalid_code' }
  }

  const linkedAccount = await User.findOne({ telegramId }).select('_id')
  if (linkedAccount) return { error: 'telegram_already_linked' }

  const code = await TelegramLinkCode.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  })
  if (!code) return { error: 'expired_code' }

  try {
    const user = await User.findOneAndUpdate(
      {
        _id: code.user,
        isActive: true,
        $or: [{ telegramId: { $exists: false } }, { telegramId: null }],
      },
      { $set: { telegramId } },
      { new: true },
    ).populate('group', 'name')
    if (!user) return { error: 'account_already_linked' }

    await TelegramLinkCode.deleteMany({ user: user._id })
    return { user }
  } catch (error) {
    if (error && error.code === 11000) return { error: 'telegram_already_linked' }
    throw error
  }
}

module.exports = { createTelegramLinkCode, linkTelegramAccount }
