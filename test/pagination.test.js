const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parsePagination } = require('../utils/pagination')

test('pagination defaults to and never exceeds 15 results', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 15 })
  assert.deepEqual(parsePagination({ page: '3', limit: '100' }), { page: 3, limit: 15 })
  assert.deepEqual(parsePagination({ page: '-2', limit: '5' }), { page: 1, limit: 5 })
})
