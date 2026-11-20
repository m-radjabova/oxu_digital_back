const mongoose = require('mongoose')
const { normalizeRoomKey } = require('../utils/room')

const lessonSchema = new mongoose.Schema(
  {
    // Ma’ruzada bir nechta guruh birlashadi, amaliyot/laboratoriyada bitta guruh bo‘ladi.
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true }],
    type: { type: String, enum: ['lecture', 'practice', 'lab'], default: 'lecture', required: true },
    // Para real vaqt va fan yuklamasi bir-biridan alohida saqlanadi.
    durationMinutes: { type: Number, required: true, default: 80, min: 1 },
    academicHours: { type: Number, required: true, default: 2, min: 1 },
    status: { type: String, enum: ['planned', 'completed', 'cancelled'], default: 'planned' },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
    dayOfWeek: { type: Number, required: true, min: 1, max: 6 },
    period: { type: Number, required: true, min: 1, max: 8 },
    weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    room: { type: String, trim: true, maxlength: 160, default: '' },
    roomKey: { type: String, select: false, default: '' },
    telegramReminderSentAt: { type: Date, select: false, default: null },
    telegramReminderClaimedAt: { type: Date, select: false, default: null },
    telegramReminderClaimToken: { type: String, select: false, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, value) {
        value.id = value._id.toString()
        delete value._id
        delete value.__v
        delete value.telegramReminderSentAt
        delete value.telegramReminderClaimedAt
        delete value.telegramReminderClaimToken
        return value
      },
    },
  },
)

lessonSchema.pre('validate', function setRoomKey() {
  this.roomKey = normalizeRoomKey(this.room || '')
})

// Bitta guruhga bir haftada bir parada faqat bitta dars: multikey unikal indeks buni ta’minlaydi.
lessonSchema.index({ groups: 1, weekStart: 1, dayOfWeek: 1, period: 1 }, { unique: true })
lessonSchema.index({ teacher: 1, weekStart: 1, dayOfWeek: 1, period: 1 }, { unique: true })
lessonSchema.index(
  { weekStart: 1, dayOfWeek: 1, period: 1, roomId: 1 },
  { unique: true, partialFilterExpression: { roomId: { $type: 'objectId' } } },
)
lessonSchema.index(
  { weekStart: 1, dayOfWeek: 1, period: 1, roomKey: 1 },
  {
    unique: true,
    partialFilterExpression: { roomKey: { $type: 'string', $gt: '' } },
  },
)
lessonSchema.index({ weekStart: 1, dayOfWeek: 1 })
// Fan–guruh yuklamasini hisoblashdagi dars qidiruvini tezlashtiradi.
lessonSchema.index({ subject: 1, groups: 1, status: 1 })

module.exports = mongoose.model('Lesson', lessonSchema)
