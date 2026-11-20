const mongoose = require('mongoose')
const Department = require('../models/Department')
const Direction = require('../models/Direction')

async function resolveDirectionScope(query = {}) {
  const { facultyId, departmentId, directionId } = query
  if (!facultyId && !departmentId && !directionId) return null
  if ([facultyId, departmentId, directionId].some((id) => id && (typeof id !== 'string' || !mongoose.isValidObjectId(id)))) {
    return { error: 'Ta’lim tuzilmasi identifikatori noto‘g‘ri.' }
  }
  const filter = {}
  if (facultyId) {
    const departments = await Department.find({ faculty: facultyId }).select('_id').lean()
    filter.department = { $in: departments.map((item) => item._id) }
  }
  if (departmentId) {
    if (filter.department && !filter.department.$in.some((id) => String(id) === departmentId)) return { directionIds: [] }
    filter.department = departmentId
  }
  if (directionId) filter._id = directionId
  const directions = await Direction.find(filter).select('_id').lean()
  return { directionIds: directions.map((item) => item._id) }
}

function idOf(value) {
  return String(value?._id || value?.id || value || '')
}

// Roll student totals up once from group → direction → department → faculty.
function withStructureCounts({ faculties, departments, directions, groups, studentCounts }) {
  const studentsByGroup = new Map(studentCounts.map((entry) => [idOf(entry._id), entry.count]))
  const byDirection = new Map(directions.map((item) => [idOf(item), { groupCount: 0, studentCount: 0 }]))
  for (const group of groups) {
    const count = byDirection.get(idOf(group.direction))
    if (count) {
      count.groupCount += 1
      count.studentCount += studentsByGroup.get(idOf(group)) || 0
    }
  }
  const byDepartment = new Map(departments.map((item) => [idOf(item), { directionCount: 0, groupCount: 0, studentCount: 0 }]))
  const countedDirections = directions.map((item) => {
    const count = byDirection.get(idOf(item))
    const parent = byDepartment.get(idOf(item.department))
    if (parent) {
      parent.directionCount += 1
      parent.groupCount += count.groupCount
      parent.studentCount += count.studentCount
    }
    return { ...item, ...count }
  })
  const byFaculty = new Map(faculties.map((item) => [idOf(item), { departmentCount: 0, directionCount: 0, groupCount: 0, studentCount: 0 }]))
  const countedDepartments = departments.map((item) => {
    const count = byDepartment.get(idOf(item))
    const parent = byFaculty.get(idOf(item.faculty))
    if (parent) {
      parent.departmentCount += 1
      parent.directionCount += count.directionCount
      parent.groupCount += count.groupCount
      parent.studentCount += count.studentCount
    }
    return { ...item, ...count }
  })
  return {
    faculties: faculties.map((item) => ({ ...item, ...byFaculty.get(idOf(item)) })),
    departments: countedDepartments,
    directions: countedDirections,
  }
}

module.exports = { withStructureCounts, resolveDirectionScope }
