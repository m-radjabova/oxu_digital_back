const express = require('express')
const mongoose = require('mongoose')
const asyncHandler = require('../middleware/asyncHandler')
const { allowRoles, requireAuth } = require('../middleware/auth')
const { listSubjects, createSubject, updateSubject, deleteSubject, setSubjectGroups, subjectLoadSummary, subjectProgressAlerts, subjectLoadOverview } = require('../controllers/subjectController')

const router = express.Router()
router.use(requireAuth)
router.get('/', asyncHandler(listSubjects))
router.get('/load-overview', allowRoles('admin'), asyncHandler(subjectLoadOverview))
router.get('/progress-alerts', allowRoles('admin'), asyncHandler(subjectProgressAlerts))
router.post('/', allowRoles('admin'), asyncHandler(createSubject))
router.get('/:id/load-summary', validateId, asyncHandler(subjectLoadSummary))
router.put('/:id', allowRoles('admin'), validateId, asyncHandler(updateSubject))
router.delete('/:id', allowRoles('admin'), validateId, asyncHandler(deleteSubject))
router.patch('/:id/groups', allowRoles('admin'), validateId, asyncHandler(setSubjectGroups))

function validateId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Fan identifikatori noto‘g‘ri.' })
  next()
}

module.exports = router
