const { createHmac, timingSafeEqual } = require('node:crypto')

function verifyTelegramWebAppData(initData, botToken, now = Date.now(), maxAgeSeconds = 300) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192 || !botToken) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  const userValue = params.get('user')
  if (
    typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash) ||
    !Number.isInteger(authDate) ||
    authDate > Math.floor(now / 1000) + 30 ||
    authDate < Math.floor(now / 1000) - maxAgeSeconds ||
    !userValue
  ) {
    return null
  }

  let user
  try {
    user = JSON.parse(userValue)
  } catch {
    return null
  }
  if (!user || typeof user !== 'object' || !/^\d+$/.test(String(user.id ?? ''))) return null

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest()
  const providedHash = Buffer.from(hash, 'hex')
  if (providedHash.length !== expectedHash.length || !timingSafeEqual(providedHash, expectedHash)) return null

  return user
}

module.exports = { verifyTelegramWebAppData }
