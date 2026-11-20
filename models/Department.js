const mongoose = require('mongoose')

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
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

departmentSchema.index({ faculty: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Department', departmentSchema)
