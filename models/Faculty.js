const mongoose = require('mongoose')

const facultySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
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

module.exports = mongoose.model('Faculty', facultySchema)
