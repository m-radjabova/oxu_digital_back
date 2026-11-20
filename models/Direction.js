const mongoose = require('mongoose')

const directionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
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

directionSchema.index({ department: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Direction', directionSchema)
