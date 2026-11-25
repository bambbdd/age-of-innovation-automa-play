import test from 'node:test'
import assert from 'node:assert/strict'
import cards from '../src/game/data/decision-cards.json' with { type: 'json' }
import { smallBoard, bridgeSites, shouldMarkNewWorkshop } from '../src/game/small-board.mjs'
import { createSetupDeal, difficultyLevels, initialAutomaWorkshops, placeStartingBuildings, prepareDeck } from '../src/game/setup.mjs'
import { roundScoring, roundTiles, finalTiles, canOverlay } from '../src/game/score-tiles.mjs'

test('every terrain and decision card matches the letters printed on the small setup card', () => {
  const positions = {
    forest: 'F8 H3 C4 F8 C4 H6', mountain: 'C3 D8 G4 D8 C3 F6',
    desert: 'D3 E8 C7 H5 C10 H5', plains: 'D9 F3 B7 F3 C2 E6',
    lake: 'B2 E7 B8 F9 B8 H7', wasteland: 'H4 E9 B4 E9 B4 H4',
    swamp: 'B6 H8 E5 H8 B6 G3',
  }
  assert.deepEqual(cards.map(card => card.id), Array.from({ length: 14 }, (_, i) => i + 1))
  for (const [terrain, labels] of Object.entries(positions)) {
    const cells = labels.split(' ')
    assert.equal(smallBoard.filter(h => h.terrain === terrain).flatMap(h => [...h.setupLetters]).sort().join(''), 'ABCDEF')
    for (const { id } of cards) {
      const offset = id <= 5 ? 0 : id <= 10 ? 2 : 4
      const [marked, unmarked] = initialAutomaWorkshops(terrain, id)
      assert.deepEqual([marked.hex, unmarked.hex], cells.slice(offset, offset + 2))
      assert.deepEqual([marked.marked, unmarked.marked], [true, false])
    }
  }
})

test('the new workshop uses strict nearest-group distance; setup letters do not control it', () => {
  assert.equal(shouldMarkNewWorkshop(0, 1), true)
  assert.equal(shouldMarkNewWorkshop(1, 1), false)
  assert.equal(shouldMarkNewWorkshop(2, 1), false)
  assert.equal(shouldMarkNewWorkshop(Infinity, Infinity), false)
})

test('small-board terrain and bridge banks have unique coordinates and two common river neighbors', () => {
  assert.equal(new Set(smallBoard.map(h => h.id)).size, smallBoard.length)
  assert.equal(smallBoard.filter(h => h.terrain !== 'river').length, 59)
  assert.equal(new Set(bridgeSites.map(pair => [...pair].sort().join())).size, 17)
  const distance = (a, b) => Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs(a.q+a.r-b.q-b.r))
  for (const [a, b] of bridgeSites) {
    const banks = [a, b].map(id => smallBoard.find(h => h.id === id))
    assert.ok(banks.every(h => h && h.terrain !== 'river'))
    const shared = smallBoard.filter(h => banks.every(bank => distance(bank, h) === 1))
    assert.equal(shared.length, 2)
    assert.ok(shared.every(h => h.terrain === 'river'))
  }
})

test('five starting decks use the correct cards and preserve a supplied top-to-bottom order', () => {
  const ids = cards.map(card => card.id)
  for (const [i, difficulty] of Object.keys(difficultyLevels).entries()) {
    const deck = prepareDeck(difficulty, ids, [...ids].reverse())
    assert.deepEqual(deck.draw, [
      [6,5,4,2,1], [6,5,4,3,2,1], [7,6,5,4,3,2,1], [8,7,6,5,4,3,2,1], [13,7,6,5,4,3,2,1],
    ][i])
    assert.equal(new Set([...deck.draw, ...deck.reserve]).size, 14)
    if (i === 0) assert.equal(deck.reserve[0], 3)
  }
  assert.throws(() => prepareDeck('Automa', ids.slice(1), ids))
})

test('seeded deals obey all printed score setup and supply constraints', () => {
  for (let seed = 0; seed < 500; seed++) {
    const deal = createSetupDeal({ seed })
    const tiles = deal.scoreTiles.rounds.map(id => roundTiles.find(t => t.id === id))
    assert.equal(new Set(tiles).size, 6)
    assert.ok(tiles.slice(4).every(t => t.action !== 'spade-spent'))
    for (const { discipline } of tiles) {
      assert.ok(tiles.slice(0, 5).filter(t => t.discipline === discipline).length <= 2)
    }
    const overlay = finalTiles.find(tile => tile.id === deal.scoreTiles.final)
    assert.ok(canOverlay(tiles[5], overlay))
    assert.equal(roundScoring(6, tiles[5], overlay).automaPoints, overlay.automaPoints)
    assert.equal(roundScoring(6, tiles[5], overlay).scienceBonus, null)
    assert.equal(roundScoring(6, tiles[5], overlay).triggers.length, 2)
    assert.equal(new Set(deal.planningOffers.map(o => o.terrain)).size, 3)
    assert.equal(new Set(deal.planningOffers.flatMap(o => o.factions)).size, 6)
    assert.deepEqual([deal.palaces.length, deal.palaces[2], deal.innovations.length,
      deal.competencies.length, deal.bookActions.length, deal.bonusTiles.choices.length], [3, 17, 6, 12, 3, 4])
  }
})

test('same setup and player choices replay the initial position, deck and remaining bonus tiles', () => {
  const choices = { playerTerrain: 'mountain', playerFaction: 'navigators', playerBonus: 3,
    playerBuildings: [{ hex: 'A2', building: 'workshop' }, { hex: 'A8', building: 'workshop' }],
    automaTerrain: 'desert' }
  const deal = createSetupDeal({ seed: 42 })
  const state = placeStartingBuildings(deal, choices)
  assert.deepEqual(state, placeStartingBuildings(createSetupDeal({ seed: 42 }), choices))
  assert.deepEqual(state.buildings.map(p => p.hex), ['A2','D3','E8','A8'])
  assert.deepEqual(state.deal.deck.draw, [5,6,4,2,1])
  assert.deepEqual(state.deal.builtBridges, [])
  assert.deepEqual(state.bonusTiles.pool.map(t => t.coins), [1,1,1])
  assert.throws(() => placeStartingBuildings(deal, { ...choices, automaTerrain: 'mountain' }))
  assert.throws(() => placeStartingBuildings(deal, { ...choices, playerBuildings: Array(2).fill(choices.playerBuildings[0]) }))
})

test('Monks place their university last and Omar choose the order of all three starting pieces', () => {
  const deal = createSetupDeal({ seed: 42 })
  deal.planningOffers = [{ terrain: 'forest', factions: ['monks', 'omar'] }]
  const base = { playerTerrain: 'forest', automaTerrain: 'desert', playerBonus: 3 }
  const monks = placeStartingBuildings(deal, { ...base, playerFaction: 'monks',
    playerBuildings: [{ hex: 'A1', building: 'university' }] })
  assert.deepEqual(monks.buildings.map(p => p.building), ['workshop','workshop','university'])
  const omar = placeStartingBuildings(deal, { ...base, playerFaction: 'omar',
    playerBuildings: [{ hex: 'A1', building: 'tower' }, { hex: 'A7', building: 'workshop' }, { hex: 'B10', building: 'workshop' }] })
  assert.deepEqual(omar.buildings.map(p => p.hex), ['A1','D3','E8','A7','B10'])
})
