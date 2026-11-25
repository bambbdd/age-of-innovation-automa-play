import test from 'node:test'
import assert from 'node:assert/strict'
import { createSetupDeal, placeStartingBuildings } from '../src/game/setup.mjs'
import { startBot, prepareNextBotRound, botTurn } from '../src/game/automa-turn.mjs'

const levels = (value = 0) => ({ banking: value, law: value, engineering: value, medicine: value })
function initial(draw = [5,6,4,2,1], extra = {}) {
  const deal = createSetupDeal({ seed: 42 })
  const position = placeStartingBuildings(deal, {
    playerTerrain: 'mountain', playerFaction: 'navigators',
    playerBuildings: ['A2','A8'].map(hex => ({ hex, building: 'workshop' })),
    automaFaction: 'simpletons', automaTerrain: 'desert', playerBonus: 3,
  })
  return startBot({ ...position, deal: { ...deal, deck: { draw, reserve: [3,7,8] } },
    round: 1, playerScience: levels(), scholarSlots: Object.fromEntries(
      Object.keys(levels()).map(key => [key, Array(4).fill(null)])),
    innovations: { pool: [3,6,2,8], player: [], automa: [] }, blocked: { power: [], book: [] },
    scoring: { discipline: 'law', automaPoints: 5 }, ...extra })
}

test('first pair, sliding support, pass symbol in last two and bonus exchange', () => {
  const game = initial()
  const first = botTurn(game)
  assert.equal(first.state.automaDeck.action, 6)
  assert.equal(first.state.automaDeck.support, 5)
  assert.equal(first.state.innovations.automa.length, 0)
  assert.equal(first.state.playerScience.banking, 0)
  assert.equal(Object.values(first.state.automaScience).reduce((a,b) => a+b), 5)
  const second = botTurn(first.state)
  assert.equal(second.state.automaDeck.support, 6)
  assert.equal(second.state.automaDeck.action, 4)
  assert.equal(second.passed, false) // Card 4 can pass, but still has two cards below it.
  const passed = botTurn(second.state)
  assert.equal(passed.passed, true)
  assert.equal(passed.state.automaDeck.support, 4)
  assert.equal(passed.state.automaDeck.action, 2)
  assert.equal(passed.state.points.automa, second.state.points.automa + 5)
  assert.equal(passed.state.bonusTiles.automa, game.bonusTiles.pool[0].id)
  assert.deepEqual(passed.state.bonusTiles.pool[0], { id: game.bonusTiles.automa, coins: 0 })
  assert.throws(() => botTurn(passed.state), /패스/)
  const newRound = prepareNextBotRound(passed.state)
  assert.deepEqual(newRound.automaDeck.draw.toSorted((a,b) => a-b), [1,2,3,4,5,6])
  assert.deepEqual(newRound.automaDeck.reserve, [7,8])
  assert.deepEqual(newRound.automaDeck, prepareNextBotRound(passed.state).automaDeck)
  assert.deepEqual(game.automaDeck.draw, [5,6,4,2,1])
})

test('exhausted deck passes using the last action as support', () => {
  let game = initial([1,3,5])
  const first = botTurn(game)
  assert.equal(first.passed, false)
  const second = botTurn(first.state)
  assert.equal(second.state.automaDeck.draw.length, 0)
  assert.equal(second.passed, false)
  game = botTurn(second.state).state
  assert.equal(game.automaDeck.support, 5)
  assert.equal(game.automaDeck.action, null)
  assert.equal(game.bonusTiles.automa, second.state.bonusTiles.pool[1].id)
})

test('Simpletons resolve construction and difficulty points as distinct actions', () => {
  const initialState = initial([1,5,3,4], { round: 4 })
  const result = botTurn(initialState)
  assert.equal(result.state.points.automa, initialState.points.automa + 1)
  assert.equal(result.state.buildings.length, initialState.buildings.length + 1)
  // A fixed 3-point action pays its printed value even at the easiest setting.
  assert.equal(botTurn(initial([5,8,1,3])).state.points.automa, 23)
})

test('directional blocking wraps separately across the remaining power and book actions', () => {
  const game = initial([10,2,3,5])
  game.blocked = { power:[1,3,5,6], book:[game.deal.bookActions[0]] }
  const result = botTurn(game).state
  assert.deepEqual(result.blocked.power, [1,3,5,6,2]) // reverse count 4 of two
  assert.equal(result.blocked.book.at(-1), game.deal.bookActions[1])
  game.blocked.power = [1,2,3,4,5,6]
  assert.equal(botTurn(game).state.blocked.book.length, 2)
})

test('innovation resolves from round 3 up to three tiles without triggering the human benefits', () => {
  const game = initial([2,6,3,4], { round: 3 })
  const first = botTurn(game).state
  assert.deepEqual(first.innovations, { pool:[3,6,2], player:[], automa:[8] })
  game.innovations.automa = [1,4,5]
  const full = botTurn(game).state
  assert.deepEqual(full.innovations, game.innovations)
  // Even when the first action fails, the second action still resolves.
  assert.notDeepEqual(full.automaScience, game.automaScience)
})

test('scholar sends use priority, highest slot, supply and Level 12 restrictions', () => {
  const game = initial([1,3,4,6])
  const result = botTurn(game).state
  assert.equal(result.automaScience.law, 4)
  assert.deepEqual(result.scholarSlots.law, ['automa',null,null,null])
  game.scholarSlots.law = ['player',null,null,null]
  assert.equal(botTurn(game).state.automaScience.law, 3)
  game.scholarSlots.law.fill('player')
  assert.equal(botTurn(game).state.automaScience.law, 2)
  game.scholarSlots.law.fill(null)
  game.scholarSlots.banking.fill('automa')
  game.scholarSlots.medicine = ['automa','automa','automa',null]
  assert.deepEqual(botTurn(game).state.scholarSlots.law, Array(4).fill(null))
  // No key is required to cross level 8.
  game.automaScience.law = 7
  assert.equal(botTurn(game).state.automaScience.law, 8)
  game.playerScience.law = 12
  game.automaScience.engineering = 0
  assert.equal(botTurn(game).state.automaScience.engineering, 1)
  game.playerScience = levels(12)
  assert.deepEqual(botTurn(game).state.automaScience, game.automaScience)
})
