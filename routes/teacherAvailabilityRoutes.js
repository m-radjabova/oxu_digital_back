const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const {
  createTeacherAvailability,
  deleteTeacherAvailability,
  listTeacherAvailability,
} = require('../controllers/teacherAvailabilityController')

const router = express.Router()
router.use(requireAuth)
router.get('/', allowRoles('admin', 'teacher'), asyncHandler(listTeacherAvailability))
router.post('/', allowRoles('teacher'), asyncHandler(createTeacherAvailability))
router.delete('/:id', allowRoles('teacher'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Band vaqt identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(deleteTeacherAvailability))

module.exports = router
