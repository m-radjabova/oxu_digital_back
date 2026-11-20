const { test, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const Faculty = require('../models/Faculty')
const Department = require('../models/Department')
const Direction = require('../models/Direction')
const Group = require('../models/Group')
const Subject = require('../models/Subject')
const User = require('../models/User')
const { withStructureCounts } = require('../utils/academicStructure')
const { createStructureItem, updateStructureItem, deleteStructureItem } = require('../controllers/academicStructureController')
const ids = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId())
afterEach(() => mock.restoreAll())
function response() {
  return { statusCode: 200, body: null, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this }, end() { this.ended = true; return this } }
}
function item(values = {}) {
  return { _id: ids[0], name: 'Texnika', isActive: true, save: mock.fn(async () => {}), populate: mock.fn(async () => {}), deleteOne: mock.fn(async () => {}), ...values }
}

test('structure totals roll up students once from groups, preserve inactive and empty branches', () => {
  const result = withStructureCounts({
    faculties: [{ id: 'f1' }, { id: 'f2', isActive: false }, { id: 'empty' }],
    departments: [{ id: 'd1', faculty: { id: 'f1' } }, { id: 'd2', faculty: { id: 'f2' } }],
    directions: [{ id: 'r1', department: { id: 'd1' } }, { id: 'r2', department: { id: 'd1' } }, { id: 'r3', department: { id: 'd2' } }],
    groups: [{ _id: 'g1', direction: 'r1' }, { _id: 'g2', direction: 'r1' }, { _id: 'g3', direction: 'r2' }, { _id: 'g4', direction: 'r3' }, { _id: 'unassigned', direction: null }],
    studentCounts: [{ _id: 'g1', count: 20 }, { _id: 'g2', count: 12 }, { _id: 'g4', count: 7 }, { _id: 'unassigned', count: 100 }],
  })
  assert.deepEqual(result.faculties[0], { id: 'f1', departmentCount: 1, directionCount: 2, groupCount: 3, studentCount: 32 })
  assert.equal(result.faculties[1].studentCount, 7)
  assert.equal(result.faculties[1].isActive, false)
  assert.equal(result.faculties[2].studentCount, 0)
  assert.equal(result.departments[0].directionCount, 2)
  assert.equal(result.directions[0].studentCount, 32)
  assert.equal(result.directions[1].studentCount, 0)
})

test('structure rejects unknown types including inherited object keys', async () => {
  for (const handler of [createStructureItem, updateStructureItem, deleteStructureItem]) {
    const res = response()
    await handler({ params: { type: 'constructor' }, body: {} }, res)
    assert.equal(res.statusCode, 404)
  }
})

test('structure create rejects blank names and invalid status', async () => {
  for (const body of [{ name: '  ' }, { name: 'x'.repeat(121) }, { name: 'Texnika', isActive: 'false' }]) {
    const res = response()
    await createStructureItem({ params: { type: 'faculties' }, body }, res)
    assert.equal(res.statusCode, 400)
  }
})

test('structure create trims names and stores the supplied status', async () => {
  mock.method(Faculty, 'exists', async () => null)
  const create = mock.method(Faculty, 'create', async (values) => item(values))
  const res = response()
  await createStructureItem({ params: { type: 'faculties' }, body: { name: '  Texnika  ', isActive: false } }, res)
  assert.equal(res.statusCode, 201)
  assert.deepEqual(create.mock.calls[0].arguments[0], { name: 'Texnika', isActive: false })
})

test('structure creation rejects duplicate names within the same parent', async () => {
  mock.method(Department, 'findById', async () => ({ _id: ids[1], faculty: ids[2], isActive: true }))
  mock.method(Faculty, 'findById', async () => ({ _id: ids[2], isActive: true }))
  const exists = mock.method(Direction, 'exists', async () => ({ _id: ids[3] }))
  const res = response()
  await createStructureItem({ params: { type: 'directions' }, body: { name: 'Dasturlash', departmentId: String(ids[1]) } }, res)
  assert.equal(res.statusCode, 409)
  assert.equal(String(exists.mock.calls[0].arguments[0].department), String(ids[1]))
})

test('direction creation rejects inactive ancestor faculties', async () => {
  mock.method(Department, 'findById', async () => ({ _id: ids[1], faculty: ids[2], isActive: true }))
  mock.method(Faculty, 'findById', async () => ({ _id: ids[2], isActive: false }))
  const res = response()
  await createStructureItem({ params: { type: 'directions' }, body: { name: 'Dasturlash', departmentId: String(ids[1]) } }, res)
  assert.equal(res.statusCode, 400)
})

test('structure mutations reject malformed ids before querying the database', async () => {
  for (const handler of [updateStructureItem, deleteStructureItem]) {
    const res = response()
    await handler({ params: { type: 'faculties', id: 'invalid' }, body: {} }, res)
    assert.equal(res.statusCode, 400)
  }
})

test('faculty edit persists name and status while excluding itself from duplicate checks', async () => {
  const current = item()
  mock.method(Faculty, 'findById', async () => current)
  const exists = mock.method(Faculty, 'exists', async () => null)
  const res = response()
  await updateStructureItem({ params: { type: 'faculties', id: String(ids[0]) }, body: { name: 'Yangi nom', isActive: false } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(current.name, 'Yangi nom')
  assert.equal(current.isActive, false)
  assert.equal(current.save.mock.callCount(), 1)
  assert.equal(String(exists.mock.calls[0].arguments[0]._id.$ne), String(ids[0]))
})

test('department rename retains its parent when status is changed from the menu', async () => {
  const current = item({ faculty: ids[1] })
  mock.method(Department, 'findById', async () => current)
  mock.method(Faculty, 'findById', async () => ({ _id: ids[1], isActive: false }))
  mock.method(Department, 'exists', async () => null)
  const res = response()
  await updateStructureItem({ params: { type: 'departments', id: String(ids[0]) }, body: { name: 'Yangi kafedra', isActive: false } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(String(current.faculty), String(ids[1]))
})

test('missing structure items return 404 for update and deletion', async () => {
  mock.method(Faculty, 'findById', async () => null)
  for (const handler of [updateStructureItem, deleteStructureItem]) {
    const res = response()
    await handler({ params: { type: 'faculties', id: String(ids[0]) }, body: { name: 'test' } }, res)
    assert.equal(res.statusCode, 404)
  }
})

test('faculty deletion protects child departments', async () => {
  const current = item()
  mock.method(Faculty, 'findById', async () => current)
  mock.method(Department, 'exists', async () => ({ _id: ids[1] }))
  const res = response()
  await deleteStructureItem({ params: { type: 'faculties', id: String(ids[0]) } }, res)
  assert.equal(res.statusCode, 409)
  assert.equal(current.deleteOne.mock.callCount(), 0)
})

test('department deletion protects child directions', async () => {
  const current = item()
  mock.method(Department, 'findById', async () => current)
  mock.method(Direction, 'exists', async () => ({ _id: ids[1] }))
  const res = response()
  await deleteStructureItem({ params: { type: 'departments', id: String(ids[0]) } }, res)
  assert.equal(res.statusCode, 409)
  assert.equal(current.deleteOne.mock.callCount(), 0)
})

test('direction deletion protects groups, subjects, and teacher assignments independently', async () => {
  for (const linkedModel of [Group, Subject, User]) {
    const current = item()
    mock.method(Direction, 'findById', async () => current)
    for (const model of [Group, Subject, User]) mock.method(model, 'exists', async () => model === linkedModel ? { _id: ids[1] } : null)
    const res = response()
    await deleteStructureItem({ params: { type: 'directions', id: String(ids[0]) } }, res)
    assert.equal(res.statusCode, 409)
    assert.equal(current.deleteOne.mock.callCount(), 0)
    mock.restoreAll()
  }
})

test('an unreferenced structure item can be deleted', async () => {
  const current = item()
  mock.method(Direction, 'findById', async () => current)
  for (const model of [Group, Subject, User]) mock.method(model, 'exists', async () => null)
  const res = response()
  await deleteStructureItem({ params: { type: 'directions', id: String(ids[0]) } }, res)
  assert.equal(res.statusCode, 204)
  assert.equal(current.deleteOne.mock.callCount(), 1)
})

test('direction scope leaves unfiltered requests unchanged and validates IDs', async () => {
  const { resolveDirectionScope } = require('../utils/academicStructure')
  assert.equal(await resolveDirectionScope({}), null)
  assert.ok((await resolveDirectionScope({ facultyId: 'invalid' })).error)
})

test('direction scope intersects faculty, department, and direction filters', async () => {
  const { resolveDirectionScope } = require('../utils/academicStructure')
  mock.method(Department, 'find', () => ({ select: () => ({ lean: async () => [{ _id: ids[1] }] }) }))
  const find = mock.method(Direction, 'find', () => ({ select: () => ({ lean: async () => [{ _id: ids[2] }] }) }))
  assert.deepEqual((await resolveDirectionScope({ facultyId: String(ids[0]), departmentId: String(ids[1]), directionId: String(ids[2]) })).directionIds, [ids[2]])
  assert.equal(find.mock.calls[0].arguments[0].department, String(ids[1]))
  assert.equal(find.mock.calls[0].arguments[0]._id, String(ids[2]))
  assert.deepEqual(await resolveDirectionScope({ facultyId: String(ids[0]), departmentId: String(ids[3]) }), { directionIds: [] })
})
