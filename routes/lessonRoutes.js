const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const { listLessons, createLesson, updateLesson, deleteLesson } = require('../controllers/lessonController')
const { myWorkload, exportMyWorkload } = require('../controllers/teacherWorkloadController')

const router = express.Router()
router.use(requireAuth)
router.get('/my-workload', allowRoles('teacher'), asyncHandler(myWorkload))
router.get('/my-workload/export', allowRoles('teacher'), asyncHandler(exportMyWorkload))
router.get('/', asyncHandler(listLessons))
router.post('/', allowRoles('admin'), asyncHandler(createLesson))
router.put('/:id', allowRoles('admin'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Dars identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(updateLesson))
router.delete('/:id', allowRoles('admin'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Dars identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(deleteLesson))

module.exports = router
