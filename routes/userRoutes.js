const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const { listUsers, createUser, updateUser, setUserStatus } = require('../controllers/userController')

const router = express.Router()
router.use(requireAuth, allowRoles('admin'))
router.route('/').get(asyncHandler(listUsers)).post(asyncHandler(createUser))
router.put('/:id', (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Hisob identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(updateUser))
router.patch('/:id/status', (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Hisob identifikatori noto‘g‘ri.' })
  }
  next()
}, asyncHandler(setUserStatus))

module.exports = router
