const mongoose = require('mongoose')

const telegramLinkCodeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

telegramLinkCodeSchema.index({ user: 1 }, { unique: true })
telegramLinkCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('TelegramLinkCode', telegramLinkCodeSchema)
