const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const { updateRoom, deleteRoom } = require('../controllers/buildingController')

const router = express.Router()
router.use(requireAuth)

function validateRoomId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Xona identifikatori noto‘g‘ri.' })
  }
  next()
}

router.put('/:id', allowRoles('admin'), validateRoomId, asyncHandler(updateRoom))
router.delete('/:id', allowRoles('admin'), validateRoomId, asyncHandler(deleteRoom))

module.exports = router
