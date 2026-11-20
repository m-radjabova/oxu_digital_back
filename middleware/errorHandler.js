function notFound(req, res) {
  res.status(404).json({ message: `${req.method} ${req.originalUrl} topilmadi.` })
}

function errorHandler(error, _req, res, _next) {
  if (error.code === 11000) {
    return res.status(409).json({ message: 'Bu ma’lumot avval kiritilgan yoki jadvaldagi vaqt band.' })
  }

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message })
  }

  if (error.message?.includes('CORS policy')) {
    return res.status(403).json({ message: error.message })
  }

  console.error(error)
  res.status(500).json({ message: 'Serverda kutilmagan xatolik yuz berdi.' })
}

module.exports = { notFound, errorHandler }
