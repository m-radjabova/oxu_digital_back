const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const { listGroups, createGroup, updateGroup, setGroupStatus, addGroupSubjects } = require('../controllers/groupController')

const router = express.Router()
router.use(requireAuth)
router.get('/', asyncHandler(listGroups))
router.post('/', allowRoles('admin'), asyncHandler(createGroup))
router.post('/:id/subjects', allowRoles('admin'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Guruh identifikatori noto‘g‘ri.' })
  next()
}, asyncHandler(addGroupSubjects))
router.put('/:id', allowRoles('admin'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Guruh identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(updateGroup))
router.patch('/:id/status', allowRoles('admin'), (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Guruh identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(setGroupStatus))

module.exports = router
