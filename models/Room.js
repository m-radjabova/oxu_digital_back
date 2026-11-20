const mongoose = require('mongoose')

const roomSchema = new mongoose.Schema(
  {
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
    number: { type: String, required: true, trim: true, maxlength: 40 },
    floor: { type: Number, min: 1, max: 100, default: null },
    capacity: { type: Number, required: true, min: 1, max: 2000, default: 30 },
    kind: {
      type: String,
      enum: ['lecture', 'classroom', 'laboratory', 'multi'],
      default: 'classroom',
      required: true,
    },
    isActive: { type: Boolean, default: true },
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

roomSchema.index({ building: 1, number: 1 }, { unique: true })

module.exports = mongoose.model('Room', roomSchema)
