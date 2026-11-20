function buildDemoAccountSpecs({ teachers, groupNames, studentsPerGroup, emailDomain }) {
  return [
    ...teachers.map((_name, index) => ({
      email: `teacher${String(index + 1).padStart(2, '0')}@${emailDomain}`,
      role: 'teacher',
    })),
    ...groupNames.flatMap((_groupName, groupIndex) =>
      Array.from({ length: studentsPerGroup }, (_student, studentIndex) => ({
        email: `student${String(studentIndex + 1).padStart(2, '0')}.g${String(groupIndex + 1).padStart(2, '0')}@${emailDomain}`,
        role: 'student',
      })),
    ),
  ]
}

function buildDemoLessonCleanupFilter(groupIds, teacherIds) {
  const conditions = []
  if (groupIds.length) conditions.push({ groups: { $in: groupIds } })
  if (teacherIds.length) conditions.push({ teacher: { $in: teacherIds } })
  return conditions.length ? { $or: conditions } : null
}

module.exports = { buildDemoAccountSpecs, buildDemoLessonCleanupFilter }
