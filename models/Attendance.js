const mongoose = require('mongoose')

const attendanceEntrySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['present', 'absent'], required: true },
  },
  { _id: false },
)

const attendanceSchema = new mongoose.Schema({
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  entries: { type: [attendanceEntrySchema], required: true },
  takenAt: { type: Date, default: Date.now },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
})

attendanceSchema.index({ lesson: 1, date: 1 }, { unique: true })

module.exports = mongoose.model('Attendance', attendanceSchema)
