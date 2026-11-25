import cards from './data/decision-cards.json' with { type: 'json' }
import { smallBoard, nativeTerrains } from './small-board.mjs'
import { roundTiles, finalTiles, canOverlay } from './score-tiles.mjs'

export const difficultyLevels = {
  Automalein: { sailing: [0, 1, 2], variablePoints: [0, 1, 1], randomExtras: 0 },
  Automa: { sailing: [0, 1, 2], variablePoints: [1, 2, 3], randomExtras: 0 },
  'Automächtig': { sailing: [1, 2, 2], variablePoints: [2, 2, 3], randomExtras: 1 },
  Ultoma: { sailing: [1, 2, 2], variablePoints: [2, 3, 3], randomExtras: 2 },
  Alptrauma: { sailing: [1, 2, 3], variablePoints: [3, 4, 4], randomExtras: 1 },
}

const humanFactions = ['blessed', 'felines', 'goblins', 'illusionists', 'inventors', 'lizards',
  'moles', 'monks', 'navigators', 'omar', 'philosophers', 'psychics']

function seededRandom(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000
  }
}

function shuffle(list, random) {
  const result = [...list]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const ids = count => Array.from({ length: count }, (_, i) => i + 1)

export function shuffleWithSeed(list, seed) {
  return shuffle(list, seededRandom(seed))
}

// Orders run from top to bottom. The independent setup draw returns to the 14-card pool.
export function prepareDeck(difficulty, reserveOrder, playOrder) {
  if (!Object.hasOwn(difficultyLevels, difficulty)) throw new Error('Unknown difficulty')
  for (const order of [reserveOrder, playOrder]) {
    if (order.length !== cards.length || new Set(order).size !== cards.length ||
        !order.every(id => Number.isInteger(id) && id >= 1 && id <= cards.length)) {
      throw new Error('Each shuffle must be a permutation of the 14 decision card IDs')
    }
  }
  const starting = new Set(cards.filter(card => card.starter).map(card => card.id))
  if (difficulty === 'Alptrauma') starting.add(13)
  const reserve = reserveOrder.filter(id => !starting.has(id))
  const extras = reserve.splice(0, difficultyLevels[difficulty].randomExtras)
  for (const id of extras) starting.add(id)
  if (difficulty === 'Automalein') {
    starting.delete(3)
    reserve.unshift(3)
  }
  return { draw: playOrder.filter(id => starting.has(id)), reserve }
}

export function initialAutomaWorkshops(terrain, setupCardId) {
  if (!nativeTerrains.includes(terrain)) throw new Error('Unknown native terrain')
  const card = cards.find(item => item.id === setupCardId)
  if (!card) throw new Error('Unknown setup card')
  return Object.entries(card.placement).map(([group, letter]) => {
    const hex = smallBoard.find(cell => cell.terrain === terrain && cell.setupLetters.includes(letter))
    return { owner: 'automa', building: 'workshop', hex: hex.id, marked: group === 'marked' }
  })
}

function dealRoundTiles(random) {
  const chosen = []
  for (let round = 6; round >= 1; round--) {
    const eligible = roundTiles.filter(tile => {
      if (chosen.includes(tile)) return false
      if (round >= 5 && tile.action === 'spade-spent') return false
      return chosen.slice(0, -1).filter(other => other.discipline === tile.discipline).length < 2
    })
    chosen.unshift(eligible[Math.floor(random() * eligible.length)])
  }
  const overlays = finalTiles.filter(tile => canOverlay(chosen[5], tile))
  return { rounds: chosen.map(tile => tile.id), final: overlays[Math.floor(random() * overlays.length)].id }
}

// Deals the shared components. The player chooses one of the three offers,
// their initial hexes, and a bonus tile from the four left after Automa takes the first.
export function createSetupDeal({ seed, difficulty = 'Automalein' }) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Expected a uint32 seed')
  const random = seededRandom(seed)
  const deal = (count, take) => shuffle(ids(count), random).slice(0, take)
  const setupCardId = deal(14, 1)[0]
  const deck = prepareDeck(difficulty, deal(14, 14), deal(14, 14))
  const factions = shuffle(humanFactions, random)
  const planningOffers = shuffle(nativeTerrains, random).slice(0, 3).map((terrain, i) => ({
    terrain, factions: factions.slice(i * 2, i * 2 + 2),
  }))
  const [automaBonus, ...bonusChoices] = deal(10, 5)
  return {
    version: 1, board: 'small', seed, difficulty, setupCardId, deck, planningOffers,
    scoreTiles: dealRoundTiles(random), bonusTiles: { automa: automaBonus, choices: bonusChoices },
    bookActions: deal(6, 3), competencies: deal(12, 12), innovations: deal(18, 6),
    palaces: [...deal(16, 2), 17], builtBridges: [],
  }
}

// Supply player placements in the chosen order. Omar may place the tower in any slot.
export function placeStartingBuildings(deal, { playerTerrain, playerFaction, playerBuildings,
  playerBonus, automaTerrain, automaFaction = 'simpletons' }) {
  const offer = deal.planningOffers.find(option => option.terrain === playerTerrain)
  if (!offer?.factions.includes(playerFaction)) throw new Error('Choose a dealt terrain and faction')
  if (!Object.hasOwn(automaStartingScience, automaFaction)) throw new Error('Unknown Automa faction')
  if (automaTerrain === playerTerrain) throw new Error('Native terrains must differ')
  if (!deal.bonusTiles.choices.includes(playerBonus)) throw new Error('Choose an available bonus tile')
  const expected = playerFaction === 'monks' ? ['university'] : ['workshop', 'workshop']
  if (playerFaction === 'omar') expected.push('tower')
  const types = playerBuildings.map(piece => piece.building).sort()
  if (types.join() !== expected.sort().join()) throw new Error('Wrong starting buildings for faction')
  const player = playerBuildings.map(({ hex, building }) => {
    if (smallBoard.find(cell => cell.id === hex)?.terrain !== playerTerrain) {
      throw new Error('Choose an empty native terrain hex')
    }
    return { owner: 'player', hex, building }
  })
  if (new Set(player.map(piece => piece.hex)).size !== player.length) throw new Error('Occupied hex')
  const bot = initialAutomaWorkshops(automaTerrain, deal.setupCardId)
  const buildings = playerFaction === 'monks' ? [...bot, ...player] : [player[0], ...bot, ...player.slice(1)]
  return {
    deal, playerTerrain, playerFaction, automaTerrain, automaFaction, buildings,
    turnOrder: ['player', 'automa'], points: { player: 20, automa: 20 },
    automaScience: { banking: 0, law: 0, engineering: 0, medicine: 0, ...automaStartingScience[automaFaction] },
    bonusTiles: { player: playerBonus, automa: deal.bonusTiles.automa,
      pool: deal.bonusTiles.choices.filter(id => id !== playerBonus).map(id => ({ id, coins: 1 })) },
    requiresFactionCard: ['symbionts', 'blight', 'gognomes'].includes(automaFaction),
  }
}

const automaStartingScience = {
  simpletons: { banking: 1, law: 1, engineering: 1, medicine: 1 },
  kuddlers: { banking: 1, law: 1 }, druids: { medicine: 2 }, racelings: { law: 1, medicine: 1 },
  wanderers: { banking: 1, engineering: 1 }, mimics: { law: 1, engineering: 1 },
  powermongers: { engineering: 1, medicine: 1 }, symbionts: { banking: 1, engineering: 1 },
  blight: { law: 1, engineering: 1 }, gognomes: { banking: 1, medicine: 1 },
}
