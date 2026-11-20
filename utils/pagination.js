function parsePagination(query, maxLimit = 15) {
  const requestedPage = Number(query.page)
  const requestedLimit = Number(query.limit)
  return {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    limit: Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : maxLimit,
  }
}

module.exports = { parsePagination }
