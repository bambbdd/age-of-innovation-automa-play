// A–I run from top to bottom. Columns use a right-shifted odd-row grid.
const terrainNames = {
  F: 'forest', M: 'mountain', D: 'desert', P: 'plains',
  L: 'lake', W: 'wasteland', S: 'swamp', '~': 'river',
}
export const nativeTerrains = Object.values(terrainNames).filter(name => name !== 'river')

// Columns start at 0. A dot is outside the board. Suffixes are the printed
// placement letters, so a single hex can serve two different setup draws.
const rows = [
  '. F M D P ~ L F M W ~',
  '~ S L:A S W:CE ~ S:AE P:C L:CE ~ F',
  '. ~ P:E M:EA F:CE ~ ~ D:C ~ ~ D:E',
  '. ~ W D:A ~ F ~ ~ M:BD P:A S',
  '. . ~ ~ ~ S:C P:F L:B D:B W:BD M',
  '. ~ L P:BD ~ W M:F ~ F:AD L:D D',
  '. . ~ S:F M:C ~ ~ ~ ~ ~ ~ ~',
  '. ~ D F:B W:AF D:DF F:F L:F S:BD F ~',
  '. ~ W P M L S P D W M ~',
]

export const smallBoard = rows.flatMap((line, row) =>
  line.split(' ').flatMap((token, column) => {
    if (token === '.') return []
    const [terrain, letters = ''] = token.split(':')
    return [{
      id: 'ABCDEFGHI'[row] + column, row, column,
      q: column - Math.floor(row / 2), r: row,
      terrain: terrainNames[terrain], setupLetters: letters,
    }]
  })
)

// Unfinished spans printed on the board. These are buildable sites.
// At setup there are no built bridges connecting these banks.
export const bridgeSites = [
  ['A6', 'B4'],
  ['A9', 'B10'],
  ['B8', 'C10'],
  ['B8', 'D8'],
  ['C4', 'D5'],
  ['C7', 'D5'],
  ['C7', 'D8'],
  ['C7', 'E7'],
  ['D2', 'F2'],
  ['D3', 'E5'],
  ['D3', 'F3'],
  ['E5', 'F3'],
  ['F5', 'G4'],
  ['F5', 'H5'],
  ['F6', 'H6'],
  ['F8', 'H8'],
  ['F9', 'H9'],
]

/** Distances are measured before placing the new workshop (Automa, pp. 4, 7). */
export function shouldMarkNewWorkshop(nearestMarked, nearestUnmarked) {
  return nearestMarked < nearestUnmarked
}
