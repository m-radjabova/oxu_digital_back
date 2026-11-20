const path = require('node:path')
const http = require('node:http')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '.env'), override: false })
const app = require('./app')
const connectDatabase = require('./config/db')
const { createRealtimeServer } = require('./services/realtime')
const startTelegramBot = require('./services/telegramBot')
const { startLessonReminders } = require('./services/telegramLessonReminder')

const port = Number(process.env.PORT) || 5050
async function startServer() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required. Add a strong secret to the backend .env file.')
  }
  await connectDatabase()
  app.locals.telegramApiBaseUrl = `http://127.0.0.1:${port}`
  const server = http.createServer(app)
  const io = createRealtimeServer(server, app.locals.allowedOrigins)
  app.locals.io = io
  await new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => resolve())
    server.once('error', reject)
  })
  console.log(`OXU server is running at http://localhost:${port}`)

  let telegramBot = null
  try {
    telegramBot = await startTelegramBot(app)
  } catch (error) {
    console.error('Unable to start Telegram bot:', error.message)
  }
  const stopLessonReminders = telegramBot ? startLessonReminders() : null
  app.locals.telegramLessonRemindersRunning = Boolean(stopLessonReminders)
  let stopping = false
  const stop = async (signal) => {
    if (stopping) return
    stopping = true
    app.locals.telegramLessonRemindersRunning = false
    await stopLessonReminders?.()
    telegramBot?.stop(signal)
    io.close(() => process.exit(0))
  }
  process.once('SIGINT', () => void stop('SIGINT'))
  process.once('SIGTERM', () => void stop('SIGTERM'))
}

startServer().catch((error) => {
  console.error('Unable to start OXU API:', error.message)
  process.exitCode = 1
})
