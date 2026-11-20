function canTeachSubject(assignedSubjectIds, subjectId) {
  return assignedSubjectIds.length > 0
    && assignedSubjectIds.some((assignedSubjectId) => assignedSubjectId.toString() === subjectId.toString())
}

module.exports = { canTeachSubject }
