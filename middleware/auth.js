const jwt = require('jsonwebtoken')
const User = require('../models/User')

async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ')
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Tizimga kirish talab qilinadi.' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub).populate('group', 'name')
    if (!user || !user.isActive || (payload.ver || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Hisob faol emas yoki topilmadi.' })
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sessiya yaroqsiz yoki muddati tugagan.' })
    }
    next(error)
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Bu amal uchun ruxsat yo‘q.' })
    }
    next()
  }
}

module.exports = { requireAuth, allowRoles }
