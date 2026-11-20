const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const { listStructure, createStructureItem, updateStructureItem, deleteStructureItem } = require('../controllers/academicStructureController')

const router = express.Router()
router.use(requireAuth)
router.get('/', asyncHandler(listStructure))
router.post('/:type', allowRoles('admin'), asyncHandler(createStructureItem))
router.patch('/:type/:id', allowRoles('admin'), asyncHandler(updateStructureItem))
router.delete('/:type/:id', allowRoles('admin'), asyncHandler(deleteStructureItem))

module.exports = router
