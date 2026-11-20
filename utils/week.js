const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function pad(value) {
  return String(value).padStart(2, '0')
}

function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !DATE_KEY_PATTERN.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function toDateKey(value = new Date()) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  return parseDateKey(value) ? value : null
}

function getTodayDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const dateParts = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
}

function getWeekStart(value = new Date()) {
  const date = parseDateKey(toDateKey(value))
  if (!date) return null
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return formatUtcDate(date)
}

function addDays(value, amount) {
  const date = parseDateKey(toDateKey(value))
  if (!date || !Number.isInteger(amount)) return null
  date.setUTCDate(date.getUTCDate() + amount)
  return formatUtcDate(date)
}

function getWeekDates(weekStart) {
  const start = getWeekStart(weekStart)
  if (!start) return null
  return Array.from({ length: 7 }, (_value, index) => addDays(start, index))
}

function isDateInWeek(dateKey, weekStart) {
  const normalizedWeek = getWeekStart(weekStart)
  return Boolean(normalizedWeek) && getWeekStart(dateKey) === normalizedWeek
}

module.exports = {
  addDays,
  getWeekDates,
  getWeekStart,
  getTodayDateKey,
  isDateInWeek,
  parseDateKey,
  toDateKey,
}
