const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
    telegramId: { type: String, unique: true, sparse: true, default: undefined },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    // O‘qituvchiga hisob yaratishda biriktirilgan fanlar (bir nechta bo‘lishi mumkin).
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    directions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Direction' }],
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    isDemoAccount: { type: Boolean, default: false, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, value) {
        value.id = value._id.toString()
        delete value._id
        delete value.__v
        delete value.password
        delete value.isDemoAccount
        return value
      },
    },
  },
)

module.exports = mongoose.model('User', userSchema)
