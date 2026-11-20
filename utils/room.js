function normalizeRoomKey(room) {
  return room.trim().replace(/\s+/g, ' ').toLowerCase()
}

function roomMatchPattern(roomKey) {
  const escapedParts = roomKey.split(' ').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^\\s*${escapedParts.join('\\s+')}\\s*$`, 'i')
}

function formatRoomName(buildingName, roomNumber) {
  return `${buildingName} ${roomNumber}-xona`
}

module.exports = { normalizeRoomKey, roomMatchPattern, formatRoomName }
