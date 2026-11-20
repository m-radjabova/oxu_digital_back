const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')
const User = require('../models/User')

function createRealtimeServer(server, allowedOrigins) {
  const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin)
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin))
      },
      methods: ['GET', 'POST'],
    },
    allowRequest(request, callback) {
      callback(null, isAllowedOrigin(request.headers.origin))
    },
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (typeof token !== 'string' || !token) {
        return next(new Error('Authentication required.'))
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET)
      if (typeof payload.sub !== 'string') {
        return next(new Error('Authentication failed.'))
      }

      const user = await User.findById(payload.sub).select('_id role group isActive tokenVersion').lean()
      if (!user || !user.isActive || (payload.ver || 0) !== (user.tokenVersion || 0)) {
        return next(new Error('Authentication failed.'))
      }

      socket.data.user = {
        id: user._id.toString(),
        role: user.role,
        groupId: user.group?.toString() || '',
        expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : null,
      }
      next()
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return next(new Error('Authentication failed.'))
      }
      console.error('[Realtime] Socket authentication failed:', error.message)
      next(new Error('Realtime connection could not be authenticated.'))
    }
  })

  io.on('connection', (socket) => {
    const { id, role, groupId, expiresAt } = socket.data.user
    socket.join(`user:${id}`)
    if (role === 'admin') socket.join('role:admin')
    if (role === 'student' && groupId) socket.join(`group:${groupId}`)

    if (expiresAt) {
      const expirationTimer = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, expiresAt - Date.now()),
      )
      expirationTimer.unref?.()
      socket.once('disconnect', () => clearTimeout(expirationTimer))
    }
  })

  return io
}

module.exports = { createRealtimeServer }
