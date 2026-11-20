const mongoose = require('mongoose')

const teacherAvailabilitySchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dayOfWeek: { type: Number, required: true, min: 1, max: 6 },
    period: { type: Number, required: true, min: 1, max: 8 },
    weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, value) {
        value.id = value._id.toString()
        delete value._id
        delete value.__v
        return value
      },
    },
  },
)

teacherAvailabilitySchema.index(
  { teacher: 1, weekStart: 1, dayOfWeek: 1, period: 1 },
  { unique: true },
)

module.exports = mongoose.model('TeacherAvailability', teacherAvailabilitySchema)
