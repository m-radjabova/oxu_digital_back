const { test } = require('node:test')
const assert = require('node:assert/strict')
const { generateSubjectColor } = require('../utils/subjectColor')

test('generated subject colors are valid HEX values', () => {
  assert.match(generateSubjectColor('Matematika'), /^#[0-9a-f]{6}$/)
  assert.match(generateSubjectColor(''), /^#[0-9a-f]{6}$/)
})

test('the same name and context always produce the same color', () => {
  const existing = ['#6658d3', '#3186c8']
  assert.equal(generateSubjectColor('Fizika', existing), generateSubjectColor('Fizika', existing))
})

test('generated colors avoid colors that are already used', () => {
  const colors = []
  for (let index = 0; index < 12; index += 1) {
    const color = generateSubjectColor('Matematika', colors)
    assert.equal(colors.includes(color), false)
    colors.push(color)
  }
})
