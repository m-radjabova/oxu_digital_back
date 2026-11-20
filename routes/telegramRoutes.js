const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const { requireAuth } = require('../middleware/auth')
const {
  createLinkCode,
  getTelegramStatus,
  unlinkTelegram,
} = require('../controllers/telegramController')

const router = express.Router()
router.use(requireAuth)
router.get('/me', asyncHandler(getTelegramStatus))
router.post('/link-code', asyncHandler(createLinkCode))
router.delete('/link', asyncHandler(unlinkTelegram))

module.exports = router
