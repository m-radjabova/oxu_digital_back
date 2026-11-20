const mongoose = require('mongoose')

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80, unique: true },
    year: { type: Number, min: 1, max: 6, default: 1 },
    direction: { type: mongoose.Schema.Types.ObjectId, ref: 'Direction', default: null },
    educationForm: { type: String, enum: ['full-time', 'evening', 'part-time'], default: 'full-time' },
    admissionYear: { type: Number, min: 1900, max: 2100 },
    studentLimit: { type: Number, min: 1, max: 500, default: 30 },
    isActive: { type: Boolean, default: true },
    scheduleRevision: { type: Number, default: 0, select: false },
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

module.exports = mongoose.model('Group', groupSchema)
