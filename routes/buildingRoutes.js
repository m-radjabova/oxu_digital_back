const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const {
  listBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  createRoom,
} = require('../controllers/buildingController')

const router = express.Router()
router.use(requireAuth)
router.get('/', allowRoles('admin'), asyncHandler(listBuildings))
router.post('/', allowRoles('admin'), asyncHandler(createBuilding))

function validateId(param, label) {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[param])) {
      return res.status(400).json({ message: `${label} identifikatori noto‘g‘ri.` })
    }
    next()
  }
}

router.post('/:buildingId/rooms', allowRoles('admin'), validateId('buildingId', 'Bino'), asyncHandler(createRoom))
router.put('/:id', allowRoles('admin'), validateId('id', 'Bino'), asyncHandler(updateBuilding))
router.delete('/:id', allowRoles('admin'), validateId('id', 'Bino'), asyncHandler(deleteBuilding))

module.exports = router
