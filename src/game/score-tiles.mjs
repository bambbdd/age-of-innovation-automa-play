// IDs match icons/round-score and icons/round-score-final in the local helper.
function roundTile(id, action, points, discipline, levels, reward, amount, early, late) {
  return { id, action, points, discipline, scienceBonus: { levels, reward, amount },
    automaPoints: { early, late } }
}

export const roundTiles = [
  roundTile(1, 'school', 4, 'banking', 1, 'coin', 1, 3, 7),
  roundTile(2, 'palace-or-university', 5, 'banking', 2, 'tool', 1, 4, 4),
  roundTile(3, 'workshop', 2, 'banking', 3, 'power', 4, 3, 5),
  roundTile(4, 'innovation', 5, 'law', 2, 'power', 3, 4, 4),
  roundTile(5, 'guild', 3, 'law', 3, 'book-of-choice', 1, 2, 5),
  roundTile(6, 'workshop', 2, 'law', 3, 'scholar', 1, 3, 5),
  roundTile(7, 'spade-spent', 2, 'engineering', 1, 'coin', 1, 3, 5),
  roundTile(8, 'sailing-or-terraforming-advance', 3, 'engineering', 3, 'scholar', 1, 2, 5),
  roundTile(9, 'city', 5, 'engineering', 4, 'spade', 1, 0, 4),
  roundTile(10, 'palace-or-university', 5, 'medicine', 2, 'tool', 1, 4, 4),
  roundTile(11, 'science-advance', 1, 'medicine', 3, 'book-of-choice', 1, 3, 5),
  roundTile(12, 'guild', 3, 'medicine', 4, 'spade', 1, 2, 5),
]

export const finalTiles = [
  { id: 1, action: 'workshop', points: 2, discipline: 'medicine', automaPoints: 8 },
  { id: 2, action: 'school', points: 4, discipline: 'law', automaPoints: 6 },
  { id: 3, action: 'workshop-on-border', points: 3, discipline: 'engineering', automaPoints: 7 },
  { id: 4, action: 'guild', points: 3, discipline: 'banking', automaPoints: 7 },
]

export function canOverlay(roundTile, finalTile) {
  const building = finalTile.action === 'workshop-on-border' ? 'workshop' : finalTile.action
  return roundTile.action !== building
}

// The final tile covers the right half only. Both left-side player triggers remain.
export function roundScoring(round, tile, overlay) {
  if (!Number.isInteger(round) || round < 1 || round > 6) throw new RangeError('Invalid round')
  const triggers = [{ action: tile.action, points: tile.points }]
  if (round === 6) {
    if (!overlay || !canOverlay(tile, overlay)) throw new Error('Invalid final round overlay')
    triggers.push({ action: overlay.action, points: overlay.points })
    return { triggers, scienceBonus: null, discipline: overlay.discipline, automaPoints: overlay.automaPoints }
  }
  return { triggers, scienceBonus: tile.scienceBonus, discipline: tile.discipline,
    automaPoints: round <= 3 ? tile.automaPoints.early : tile.automaPoints.late }
}
