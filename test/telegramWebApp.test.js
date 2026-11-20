const { createHmac } = require('node:crypto')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { verifyTelegramWebAppData } = require('../utils/telegramWebApp')

const BOT_TOKEN = 'local-test-token'

function createInitData(user, authDate) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    user: JSON.stringify(user),
  })
  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const hash = createHmac('sha256', secretKey).update(checkString).digest('hex')
  params.set('hash', hash)
  return params.toString()
}

test('Telegram Web App data accepts a valid, recent signature', () => {
  const now = Date.now()
  const user = { id: 12345, first_name: 'Test' }
  const initData = createInitData(user, Math.floor(now / 1000))

  assert.deepEqual(verifyTelegramWebAppData(initData, BOT_TOKEN, now), user)
})

test('Telegram Web App data rejects tampered and expired signatures', () => {
  const now = Date.now()
  const initData = createInitData({ id: 12345 }, Math.floor(now / 1000) - 301)

  assert.equal(verifyTelegramWebAppData(initData, BOT_TOKEN, now), null)
  assert.equal(verifyTelegramWebAppData(`${initData}&user=%7B%22id%22%3A999%7D`, BOT_TOKEN, now), null)
})
