import test from 'node:test'
import { smallBoard } from '../src/game/small-board.mjs'
import assert from 'node:assert/strict'
import { adjacentLand, landInReach, automaDistances, placeBridge, automaSailing,
  terrainAt, terraformAndBuild, upgradePlayerBuilding, newCityGroups, foundCities, areaScoring } from '../src/game/board-rules.mjs'
import { resolveAutomaBoardAction as resolve } from '../src/game/automa-board.mjs'
import { placeStartingBuildings, createSetupDeal } from '../src/game/setup.mjs'

const player = (hex, building = 'workshop') => ({ owner: 'player', hex, building })
const bot = (hex, marked, building = 'workshop') => ({ owner: 'automa', hex, building, marked })
const board = (buildings, extra = {}) => ({
  deal: { difficulty: 'Automa' }, playerTerrain: 'wasteland', automaTerrain: 'lake', buildings, ...extra,
})

test('only a built bridge confers adjacency, sailing crosses consecutive rivers', () => {
  const start = board([player('B4')])
  assert.deepEqual([...landInReach(start, 'A6', 0)].sort(), ['A7', 'B6'])
  assert.ok(landInReach(start, 'A6', 1).has('B4'))
  assert.ok(!landInReach(start, 'A6', 1).has('C7'))
  assert.ok(landInReach(start, 'A6', 2).has('C7'))
  assert.ok(!landInReach(start, 'A1', 3).has('A3'))
  assert.ok(!adjacentLand(start, 'A6').has('B4'))
  const linked = placeBridge(start, 'player', 'B4', 'A6')
  assert.ok(adjacentLand(linked, 'A6').has('B4'))
  assert.ok(adjacentLand(linked, 'B4').has('A6'))
  assert.throws(() => placeBridge(linked, 'player', 'A6', 'B4'), /Unavailable/)
  assert.throws(() => placeBridge(start, 'player', 'B4', 'A4'), /Unavailable/)
  assert.throws(() => placeBridge(start, 'player', 'C7', 'D8'), /owned building/)
})

test('shortest distance counts intervening hexes, passing rivers and Automa but avoiding player buildings', () => {
  assert.equal(automaDistances(board([bot('A2', true)]), ['A1']).get('A3'), 1)
  assert.equal(automaDistances(board([player('A2')]), ['A1']).get('A3'), 2)
  assert.equal(automaDistances(board([player('A2')]), ['A2']).get('A3'), 0)
  assert.equal(automaDistances(board([]), ['A6']).get('B4'), 1)
})

test('player may terraform in steps and build only on reachable native terrain', () => {
  const start = board([player('A1')], { playerTerrain: 'desert' })
  const step = terraformAndBuild(start, 'A2', 0, { terrain: 'wasteland', build: false })
  assert.equal(step.spades, 1)
  assert.equal(terrainAt(step.position, 'A2'), 'wasteland')
  assert.equal(terrainAt(start, 'A2'), 'mountain')
  assert.equal(step.position.buildings.length, 1)
  const placed = terraformAndBuild(step.position, 'A2', 0)
  assert.equal(placed.spades, 1)
  assert.equal(terrainAt(placed.position, 'A2'), 'desert')
  assert.deepEqual(placed.position.buildings.at(-1), player('A2'))
  assert.throws(() => terraformAndBuild(placed.position, 'A2', 0), /occupied/)
  assert.throws(() => terraformAndBuild(start, 'A8', 0), /reach/)
  assert.throws(() => terraformAndBuild(start, 'A2', 0, { terrain: 'forest', build: false }), /towards/)
  assert.throws(() => terraformAndBuild(start, 'A2', 0, { terrain: 'wasteland' }), /native terrain/)
})

test('Automa rulebook p. 7, blue sailing 1, two lakes remain and the one beside red wins', () => {
  const position = board([
    ...['C3', 'D3', 'C7'].map(hex => bot(hex, true)),
    ...['F5', 'F6', 'G3', 'G4'].map(hex => bot(hex, false)),
    player('D5'), player('E6'),
  ])
  const result = resolve(position, 'transform-and-build', 3, 3)
  // The printed diagram is cropped just to the right of E7.
  const visible = new Set(['C2','C3','C4','C5','C6','C7','D2','D3','D4','D5','D6',
    'E3','E4','E5','E6','E7','F2','F3','F4','F5','F6','G3','G4','G5','G6','G7'])
  assert.deepEqual(result.trace.bringTogether.filter(hex => visible.has(hex)), ['E5', 'E7', 'F2', 'F3'])
  assert.deepEqual(result.trace.terrain, ['E7', 'F2'])
  assert.deepEqual(result.trace.closestPlayer, ['E7'])
  assert.equal(result.hex, 'E7')
  assert.equal(result.marked, false)
  assert.deepEqual([result.trace.nearestMarked, result.trace.nearestUnmarked], [1, 0])
  assert.equal(result.powerOffered, 1)
})

test('marking uses strictly shorter pre-build distance even with a marked support icon', () => {
  const tied = resolve(board([bot('A1', true), bot('A2', false), player('I10')]), 'transform-and-build', 1, 1)
  assert.deepEqual([tied.trace.nearestMarked, tied.trace.nearestUnmarked, tied.marked], [0, 0, false])
  assert.equal(terrainAt(tied.position, tied.hex), 'lake')
  const closer = resolve(board([bot('A6', true), bot('B2', false), player('A2')]), 'transform-and-build', 1, 1)
  assert.ok(closer.marked)
  assert.equal(closer.position.buildings.at(-1).marked, true)
})

test('bring together keeps reachable hexes when none shortens the gap or both groups are in reach', () => {
  for (const [a, b] of [['A1', 'A6'], ['A1', 'A2']]) {
    const { trace } = resolve(board([bot(a, true), bot(b, false)]), 'transform-and-build', 3, 1)
    assert.ok(trace.reachable.length)
    assert.deepEqual(trace.bringTogether, trace.reachable)
  }
})

test('player chooses a legal upgrade from stock and neutral pieces cannot upgrade', () => {
  const start = board([player('A1', 'guild'), player('A2', 'palace'), { ...player('A3'), neutral: true }])
  assert.equal(upgradePlayerBuilding(start, 'A1', 'school').buildings[0].building, 'school')
  assert.throws(() => upgradePlayerBuilding(start, 'A1', 'palace'), /Unavailable/)
  assert.throws(() => upgradePlayerBuilding(start, 'A3', 'guild'), /Unavailable/)
})

test('upgrade prefers a workshop beside the player and minimizes power offered', () => {
  const start = board([bot('A2', true), bot('A8', false), bot('I2', true, 'guild'),
    player('A1', 'palace'), player('A9')])
  const result = resolve(start, 'upgrade', 1, 1)
  assert.equal(result.hex, 'A8')
  assert.equal(result.building, 'guild')
  assert.equal(result.powerOffered, 1)
  assert.equal(result.position.buildings[1].marked, false)
  assert.equal(start.buildings[1].building, 'workshop')
})

test('directional selection counts in board order, reversing and wrapping for excess count', () => {
  const start = board([bot('A3', false), bot('A2', true)])
  assert.equal(resolve(start, 'upgrade', 1, 1).hex, 'A3') // second in forward order
  assert.equal(resolve(start, 'upgrade', 2, 1).hex, 'A3') // first in reverse
  assert.equal(resolve(start, 'upgrade', 4, 1).hex, 'A3') // third in reverse wraps around
})

test('failed construction falls back to highest legal upgrade or skips if none exists', () => {
  const start = board([bot('A1', true, 'guild'), player('A2'), player('B1')])
  const palace = resolve(start, 'transform-and-build', 1, 1)
  assert.equal(palace.trace.fallback, 'no-reachable-hex')
  assert.equal(palace.building, 'palace')
  const skip = resolve(palace.position, 'transform-and-build', 1, 1)
  assert.equal(skip.action, 'skip')
  assert.equal(skip.position, palace.position)
  const next = board([...palace.position.buildings, bot('I9', false, 'guild')])
  assert.equal(resolve(next, 'upgrade', 1, 1).building, 'school')
  const allWorkshops = board(['A1','A2','A3','A4','A6','A7','A8','A9','B1'].map(hex => bot(hex, true)))
  assert.equal(resolve(allWorkshops, 'transform-and-build', 1, 1).trace.fallback, 'no-workshop')
})

test('cities use adjacency, count annexes and apply the university and monument exceptions', () => {
  const dry = board([player('B4', 'guild'), player('C4', 'guild'), player('A6', 'guild'), player('A7')])
  assert.deepEqual(newCityGroups(dry), [])
  const bridged = placeBridge(dry, 'player', 'A6', 'B4')
  assert.equal(newCityGroups(bridged)[0].length, 4)
  const founded = foundCities(bridged)
  assert.equal(founded.cities.length, 1)
  assert.deepEqual(newCityGroups({ ...founded.position, buildings: [...founded.position.buildings, player('A8')] }), [])
  const three = board([player('A1', 'university'), player('A2', 'guild'), player('A3', 'school')])
  assert.equal(newCityGroups(three)[0].length, 3)
  assert.equal(newCityGroups(board([player('A1','monument'), player('A2','palace')]))[0].length, 2)
  assert.equal(newCityGroups(board([{ ...player('A1','guild'), annex:true }, player('A2','guild'), player('A3','guild')]))[0].length, 3)
  assert.deepEqual(newCityGroups(board([player('A1'), player('A2'), player('A3'), player('A4')])), [])
})

test('largest connected area uses final sailing, counts each building once and shares tied points', () => {
  const start = board([player('A1'), { ...player('A3'), annex:true }, bot('B4', true), bot('A6', false)])
  assert.deepEqual(areaScoring(start, 0), { sizes: { player: 1, automa: 2 }, points: { player: 12, automa: 18 } })
  assert.deepEqual(areaScoring({ ...start, playerFaction:'moles' }, 0).points, { player: 15, automa: 15 })
  const flight = board([player('A1'), player('A4'), bot('I9', true)])
  assert.equal(areaScoring(flight, 0, { flight: true }).sizes.player, 2)
})

test('the phase-one setup can play board actions at each difficulty and round', () => {
  for (const [difficulty, expected] of Object.entries({
    Automalein:[0,0,1,1,2,2], Automa:[0,0,1,1,2,2], Automächtig:[1,1,2,2,2,2],
    Ultoma:[1,1,2,2,2,2], Alptrauma:[1,1,2,2,3,3],
  })) {
    const deal = createSetupDeal({ seed:42, difficulty })
    const { terrain, factions } = deal.planningOffers[0]
    const faction = factions.find(name => !['omar','monks'].includes(name)) ?? factions[0]
    const count = faction === 'monks' ? 1 : faction === 'omar' ? 3 : 2
    const pieces = smallBoard.filter(c => c.terrain === terrain).slice(0,count)
      .map((c,i) => player(c.id, faction === 'monks' ? 'university' : i === 2 ? 'tower' : 'workshop'))
    let position = placeStartingBuildings(deal, { playerTerrain:terrain, playerFaction:faction,
      playerBuildings:pieces, automaTerrain:terrain === 'desert' ? 'lake' : 'desert', playerBonus:deal.bonusTiles.choices[0] })
    for (let round = 1; round <= 6; round++) {
      assert.equal(automaSailing(position, round), expected[round-1])
      const result = resolve(position, 'transform-and-build', round, round)
      assert.notEqual(result.action, 'skip')
      position = result.position
      assert.equal(new Set(position.buildings.map(b => b.hex)).size, position.buildings.length)
    }
  }
})
