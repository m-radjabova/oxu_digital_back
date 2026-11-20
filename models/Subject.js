const mongoose = require('mongoose')

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
    color: { type: String, default: '#6658d3', match: /^#[0-9a-fA-F]{6}$/ },
    // Fan pasporti. Eski fanlar uchun bu maydonlar ixtiyoriy qoldirilgan.
    code: { type: String, trim: true, uppercase: true, maxlength: 30, sparse: true, unique: true },
    direction: { type: mongoose.Schema.Types.ObjectId, ref: 'Direction', default: null },
    course: { type: Number, min: 1, max: 6, default: null },
    semester: { type: Number, min: 1, max: 2, default: null },
    educationForm: { type: String, enum: ['full-time', 'evening'], default: 'full-time' },
    block: { type: String, enum: ['mandatory', 'elective'], default: 'mandatory' },
    subjectType: { type: String, enum: ['theory', 'theory-practice', 'practice'], default: 'theory-practice' },
    ratingType: { type: String, enum: ['100-point', 'credit'], default: '100-point' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    hours: {
      lecture: { type: Number, min: 0, default: 0 },
      practice: { type: Number, min: 0, default: 0 },
      lab: { type: Number, min: 0, default: 0 },
      independent: { type: Number, min: 0, default: 0 },
    },
    credits: { type: Number, min: 0, max: 60, default: 0 },
    // Bir fan bir vaqtning o'zida bir nechta guruhga tegishli bo'lishi mumkin.
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
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

module.exports = mongoose.model('Subject', subjectSchema)
