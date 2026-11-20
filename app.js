const cors = require('cors')
const express = require('express')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const authRoutes = require('./routes/authRoutes')
const attendanceRoutes = require('./routes/attendanceRoutes')
const academicStructureRoutes = require('./routes/academicStructureRoutes')
const groupRoutes = require('./routes/groupRoutes')
const lessonRoutes = require('./routes/lessonRoutes')
const buildingRoutes = require('./routes/buildingRoutes')
const roomRoutes = require('./routes/roomRoutes')
const telegramRoutes = require('./routes/telegramRoutes')
const teacherAvailabilityRoutes = require('./routes/teacherAvailabilityRoutes')
const subjectRoutes = require('./routes/subjectRoutes')
const userRoutes = require('./routes/userRoutes')
const { notFound, errorHandler } = require('./middleware/errorHandler')

const app = express()
// Trust only the configured number of reverse proxies (Render: one).
const proxyHops = Number(process.env.TRUST_PROXY || 0)
if (Number.isInteger(proxyHops) && proxyHops > 0) app.set('trust proxy', proxyHops)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'So‘rovlar soni juda ko‘p. Birozdan keyin qayta urinib ko‘ring.' },
})
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean),
]
app.locals.allowedOrigins = allowedOrigins

app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
}))
app.use(express.json({ limit: '20kb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(apiLimiter)
app.use('/auth', authRoutes)
app.use('/academic-structure', academicStructureRoutes)
app.use('/attendance', attendanceRoutes)
app.use('/users', userRoutes)
app.use('/groups', groupRoutes)
app.use('/subjects', subjectRoutes)
app.use('/lessons', lessonRoutes)
app.use('/buildings', buildingRoutes)
app.use('/rooms', roomRoutes)
app.use('/teacher-availability', teacherAvailabilityRoutes)
app.use('/telegram', telegramRoutes)

app.use(notFound)
app.use(errorHandler)

module.exports = app
