import test from 'node:test'
import assert from 'node:assert/strict'
import { starterInnovations, innovationCost, innovationPoints, competencyLocation,
  tileIncome, tilePassPoints } from '../src/game/first-game-tiles.mjs'

const piece = (hex, building = 'workshop', extra = {}) => ({ owner: 'player', hex, building, ...extra })
function position(buildings = []) {
  return {
    playerTerrain: 'mountain',
    deal: { innovations: [...starterInnovations], competencies: [6, 4, 2, 5, 9, 1, 7, 11, 8, 3, 12, 10] },
    innovations: { player: [], automa: [], pool: [...starterInnovations] },
    competencies: [], buildings, playerScience: { banking: 4, law: 9, engineering: 0, medicine: 9 },
  }
}

test('innovation book colors refer to the original market slot even after removals', () => {
  const s = position()
  assert.deepEqual(innovationCost(s, 5), {
    coins: 5, books: { banking: 2, law: 2, engineering: 0, medicine: 0 }, anyBooks: 1,
  })
  s.innovations.pool.splice(0, 2)
  s.innovations.player.push(5)
  assert.deepEqual(innovationCost(s, 9), {
    coins: 5, books: { banking: 0, law: 2, engineering: 0, medicine: 0 }, anyBooks: 4,
  })
  assert.throws(() => innovationCost(s, 6))
  s.buildings.push(piece('A1', 'palace'))
  s.innovations.player.push(7)
  assert.equal(innovationCost(s, 10).coins, 0)
  assert.equal(innovationCost(s, 10).anyBooks, 5)
  s.innovations.player.push(16)
  assert.throws(() => innovationCost(s, 9))
})

test('instant scoring counts player cities, structures and levels at development time', () => {
  const s = position([piece('A1', 'school', { cityId: 'A1' }), piece('A2', 'workshop', { cityId: 'A1' }),
    piece('A3'), { owner: 'automa', hex: 'B4', building: 'school' }])
  assert.equal(innovationPoints(s, 5), 0)
  assert.equal(innovationPoints(s, 6), 5)
  assert.equal(innovationPoints(s, 7), 4)
  assert.equal(innovationPoints(s, 9), 5)
  assert.equal(innovationPoints(s, 10), 18)
})

test('Communications counts adjacent groups and includes built bridges', () => {
  const s = position(['B4', 'A6', 'I9', 'F8'].map(hex => piece(hex)))
  assert.equal(innovationPoints(s, 16), 8)
  s.builtBridges = [['B4', 'A6']]
  assert.equal(innovationPoints(s, 16), 0)
})

test('competency display gives science and books by slot and forbids duplicate acquisition', () => {
  const s = position()
  assert.deepEqual(competencyLocation(s, 4), { discipline: 'law', levels: 3, books: 0 })
  assert.deepEqual(competencyLocation(s, 7), { discipline: 'engineering', levels: 2, books: 1 })
  assert.deepEqual(competencyLocation(s, 8), { discipline: 'banking', levels: 1, books: 2 })
  s.competencies.push(4)
  assert.throws(() => competencyLocation(s, 4))
})

test('owned palace and competency tiles grant their printed income and pass bonuses', () => {
  const s = position([piece('A1', 'school', { cityId: 'A1' })])
  s.palace = 7
  s.competencies = [1, 2, 3, 8, 9, 12]
  s.playerScience.engineering = 3
  assert.deepEqual(tileIncome(s), { power: 7, books: 1, points: 3, coins: 4, tools: 1, scienceChoice: 1 })
  assert.equal(tilePassPoints(s), 8)
})
