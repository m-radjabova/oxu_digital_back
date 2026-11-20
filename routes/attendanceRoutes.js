const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const {
  getLessonAttendance,
  getMyAttendance,
  listAttendanceStatuses,
  takeAttendance,
} = require('../controllers/attendanceController')

const router = express.Router()
router.use(requireAuth)
router.get('/me', allowRoles('student'), asyncHandler(getMyAttendance))
router.get('/', allowRoles('teacher'), asyncHandler(listAttendanceStatuses))
router.get('/lessons/:lessonId', allowRoles('teacher'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.lessonId)) {
    return res.status(400).json({ message: 'Dars identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(getLessonAttendance))
router.post('/lessons/:lessonId', allowRoles('teacher'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.lessonId)) {
    return res.status(400).json({ message: 'Dars identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(takeAttendance))

module.exports = router
