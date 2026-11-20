require('dotenv').config({ quiet: true })
const ExcelJS = require('exceljs')
const base = 'http://127.0.0.1:5050'
async function login(email, password) {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!response.ok) throw new Error(`Login failed: ${response.status}`)
  const body = await response.json()
  return body.token || body.accessToken
}
async function main() {
  const [teacher, other, student, admin] = await Promise.all([
    login('teacher01@gmail.com', process.env.SEED_PASSWORD), login('teacher02@gmail.com', process.env.SEED_PASSWORD), login('student01@gmail.com', process.env.SEED_PASSWORD), login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD),
  ])
  const get = (token, route) => fetch(base + route, { headers: { authorization: `Bearer ${token}` } })
  const [a, b, c, d, file] = await Promise.all([
    get(teacher, '/lessons/my-workload?year=2026&semester=fall'), get(other, '/lessons/my-workload?year=2026&semester=fall'), get(student, '/lessons/my-workload'), get(admin, '/lessons/my-workload'), get(teacher, '/lessons/my-workload/export?year=2026&semester=fall'),
  ])
  const one = await a.json(), two = await b.json()
  if (a.status !== 200 || b.status !== 200 || one.teacher.email === two.teacher.email || c.status !== 403 || d.status !== 403 || file.status !== 200) throw new Error('Authentication or report check failed.')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()))
  if (!workbook.worksheets[0] || workbook.worksheets[0].getRow(6).getCell(3).value !== one.rows[0]?.subject) throw new Error('Excel content differs from report.')
  console.log(JSON.stringify({ teacherStatus: a.status, teacher: one.teacher.name, total: one.totals.total, rows: one.rows.length, differentTeacher: two.teacher.name, studentStatus: c.status, adminStatus: d.status, excel: 'valid xlsx; rows match report' }))
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
