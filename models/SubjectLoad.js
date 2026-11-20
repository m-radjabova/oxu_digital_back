const mongoose = require('mongoose')

// Bitta fan–guruh–mashg'ulot turi uchun rejalashtirilgan yuklama.
// Unique indeks va Mongo transaction bir paytdagi admin so'rovlarida limit oshishini oldini oladi.
const subjectLoadSchema = new mongoose.Schema({
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  type: { type: String, enum: ['lecture', 'practice', 'lab'], required: true },
  plannedHours: { type: Number, min: 0, default: 0 },
  completedHours: { type: Number, min: 0, default: 0 },
}, { timestamps: true })

subjectLoadSchema.index({ subject: 1, group: 1, type: 1 }, { unique: true })

module.exports = mongoose.model('SubjectLoad', subjectLoadSchema)
