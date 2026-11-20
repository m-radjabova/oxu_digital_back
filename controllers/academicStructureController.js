const mongoose = require('mongoose')
const Department = require('../models/Department')
const Direction = require('../models/Direction')
const Faculty = require('../models/Faculty')
const Group = require('../models/Group')
const User = require('../models/User')
const Subject = require('../models/Subject')
const { withStructureCounts } = require('../utils/academicStructure')

const RESOURCE_MODELS = {
  faculties: { model: Faculty },
  departments: { model: Department, parentField: 'faculty', parentName: 'facultyId', parentModel: Faculty },
  directions: { model: Direction, parentField: 'department', parentName: 'departmentId', parentModel: Department },
}
const configFor = (type) => Object.hasOwn(RESOURCE_MODELS, type) ? RESOURCE_MODELS[type] : null

async function listStructure(_req, res) {
  const [faculties, departments, directions, groups, studentCounts] = await Promise.all([
    Faculty.find().sort({ name: 1 }),
    Department.find().populate('faculty', 'name isActive').sort({ name: 1 }),
    Direction.find()
      .populate({ path: 'department', select: 'name faculty isActive', populate: { path: 'faculty', select: 'name isActive' } })
      .sort({ name: 1 }),
    Group.find().select('_id direction').lean(),
    User.aggregate([
      { $match: { role: 'student', isActive: { $ne: false }, group: { $ne: null } } },
      { $group: { _id: '$group', count: { $sum: 1 } } },
    ]),
  ])
  res.json(withStructureCounts({
    faculties: faculties.map((item) => item.toJSON()),
    departments: departments.map((item) => item.toJSON()),
    directions: directions.map((item) => item.toJSON()),
    groups,
    studentCounts,
  }))
}

async function populateItem(item, config) {
  if (config.parentField === 'department') {
    await item.populate({ path: 'department', select: 'name faculty isActive', populate: { path: 'faculty', select: 'name isActive' } })
  } else if (config.parentField) {
    await item.populate('faculty', 'name isActive')
  }
  return item
}

async function parseInput(body, config, current = null) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) return { error: 'Nomni kiriting (ko‘pi bilan 120 belgi).' }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return { error: 'Holat true yoki false bo‘lishi kerak.' }
  }
  const value = { name }
  if (body.isActive !== undefined) value.isActive = body.isActive
  if (config.parentField) {
    const parentId = body[config.parentName] ?? current?.[config.parentField]
    if (!mongoose.isValidObjectId(parentId)) return { error: 'Yuqori bo‘limni tanlang.' }
    const parent = await config.parentModel.findById(parentId)
    if (!parent) return { error: 'Tanlangan yuqori bo‘lim topilmadi.' }
    // Existing records may still be renamed/deactivated under an inactive parent.
    const needsActiveParent = !current || String(current[config.parentField]) !== String(parentId)
      || (body.isActive === true && current.isActive === false)
    if (needsActiveParent) {
      const faculty = config.parentField === 'department' ? await Faculty.findById(parent.faculty) : null
      if (parent.isActive === false || (config.parentField === 'department' && (!faculty || faculty.isActive === false))) {
        return { error: 'Faol fakultet va kafedrani tanlang.' }
      }
    }
    value[config.parentField] = parent._id
  }
  const filter = { name, ...(current ? { _id: { $ne: current._id } } : {}) }
  if (config.parentField) filter[config.parentField] = value[config.parentField]
  if (await config.model.exists(filter)) return { conflict: 'Bu nomdagi bo‘lim allaqachon mavjud.' }
  return { value }
}

async function createStructureItem(req, res) {
  const config = configFor(req.params.type)
  if (!config) return res.status(404).json({ message: 'Ta’lim tuzilmasi turi topilmadi.' })
  const result = await parseInput(req.body || {}, config)
  if (result.error) return res.status(400).json({ message: result.error })
  if (result.conflict) return res.status(409).json({ message: result.conflict })
  const item = await config.model.create(result.value)
  res.status(201).json(await populateItem(item, config))
}

async function updateStructureItem(req, res) {
  const config = configFor(req.params.type)
  if (!config) return res.status(404).json({ message: 'Ta’lim tuzilmasi turi topilmadi.' })
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Bo‘lim identifikatori noto‘g‘ri.' })
  const item = await config.model.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Bo‘lim topilmadi.' })
  const result = await parseInput(req.body || {}, config, item)
  if (result.error) return res.status(400).json({ message: result.error })
  if (result.conflict) return res.status(409).json({ message: result.conflict })
  Object.assign(item, result.value)
  await item.save()
  res.json(await populateItem(item, config))
}

async function deleteStructureItem(req, res) {
  const config = configFor(req.params.type)
  if (!config) return res.status(404).json({ message: 'Ta’lim tuzilmasi turi topilmadi.' })
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Bo‘lim identifikatori noto‘g‘ri.' })
  const item = await config.model.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Bo‘lim topilmadi.' })
  let linked
  if (req.params.type === 'faculties') linked = await Department.exists({ faculty: item._id })
  else if (req.params.type === 'departments') linked = await Direction.exists({ department: item._id })
  else {
    const references = await Promise.all([
      Group.exists({ direction: item._id }),
      Subject.exists({ direction: item._id }),
      User.exists({ directions: item._id }),
    ])
    linked = references.some(Boolean)
  }
  if (linked) return res.status(409).json({ message: 'Bu bo‘limga ma’lumotlar biriktirilgan. Avval ularni boshqa bo‘limga ko‘chiring yoki bo‘limni nofaol qiling.' })
  await item.deleteOne()
  res.status(204).end()
}

module.exports = { listStructure, createStructureItem, updateStructureItem, deleteStructureItem }
