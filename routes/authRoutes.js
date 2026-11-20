const express = require('express')
const rateLimit = require('express-rate-limit')
const asyncHandler = require('../middleware/asyncHandler')
const { requireAuth } = require('../middleware/auth')
const { requestPasswordReset, resetPassword } = require('../controllers/passwordResetController')
const { login, telegramWebAppLogin, changePassword, me } = require('../controllers/authController')

const router = express.Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.' },
})

const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.' } })

router.post('/forgot-password', resetLimiter, asyncHandler(requestPasswordReset))
router.post('/reset-password', resetLimiter, asyncHandler(resetPassword))
router.post('/login', loginLimiter, asyncHandler(login))
router.post('/telegram-webapp', loginLimiter, asyncHandler(telegramWebAppLogin))
router.patch('/password', requireAuth, asyncHandler(changePassword))
router.get('/me', requireAuth, asyncHandler(me))

module.exports = router
