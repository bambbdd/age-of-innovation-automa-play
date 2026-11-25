import cards from './data/decision-cards.json' with { type: 'json' }
import { difficultyLevels, shuffleWithSeed } from './setup.mjs'
import { resolveAutomaBoardAction } from './automa-board.mjs'

const byId = new Map(cards.map(card => [card.id, card]))
const disciplines = ['banking', 'law', 'engineering', 'medicine']
const scienceNames = { banking: '은행학', law: '법학', engineering: '공학', medicine: '의학' }
const powerActionIds = [1, 2, 3, 4, 5, 6]
const buildingNames = { guild: '길드', palace: '궁전', school: '학교', university: '대학' }

function roundDeck(draw, reserve, cycle) {
  return { draw, reserve, used: [], action: null, support: null, passed: false, cycle }
}

export function startBot(state) {
  if (state.automaFaction !== 'simpletons') throw new Error('첫 대국의 오토마는 단순족입니다.')
  const { draw, reserve } = state.deal.deck
  return { ...state, automaDeck: roundDeck([...draw], [...reserve], 1) }
}

// Keep the cards that were left in the draw pile when an early pass occurred.
export function prepareNextBotRound(state) {
  const deck = state.automaDeck
  if (!deck.passed) throw new Error('오토마가 아직 패스하지 않았습니다.')
  const cycle = deck.cycle + 1
  const all = [...deck.used, ...deck.draw, ...deck.reserve.slice(0, 1)]
  const seed = (state.deal.seed + Math.imul(cycle, 0x9e3779b9)) >>> 0
  return { ...state, automaDeck: roundDeck(shuffleWithSeed(all, seed), deck.reserve.slice(1), cycle) }
}

function drawPair(deck) {
  if (deck.passed) throw new Error('이미 패스한 오토마입니다.')
  const draw = [...deck.draw]
  const used = [...deck.used]
  let support = deck.action
  if (support === null) {
    support = draw.shift()
    used.push(support)
  }
  const inLastTwo = draw.length <= 2
  const action = draw.shift() ?? null
  if (action !== null) used.push(action)
  const passed = action === null || (inLastTwo && byId.get(action).canPass)
  return { ...deck, draw, used, action, support, passed }
}

function choose(options, support) {
  const offset = (support.count - 1) % options.length
  return options[support.direction === 'left-up' ? options.length - 1 - offset : offset]
}

function addPoints(state, amount) {
  return { ...state, points: { ...state.points, automa: state.points.automa + amount } }
}

function pass(state, support) {
  const index = { left: 0, middle: 1, right: 2 }[support.bonus]
  const selected = state.bonusTiles.pool[index]
  const pool = state.bonusTiles.pool.map((tile, i) => i === index ? { id: state.bonusTiles.automa, coins: 0 } : tile)
  const next = addPoints(state, state.scoring.automaPoints)
  next.bonusTiles = { ...state.bonusTiles, automa: selected.id, pool }
  return { state: next, passed: true, powerOffered: 0,
    summary: `단순족 패스 · 라운드 점수 +${state.scoring.automaPoints} · 보너스 타일 ${selected.id}` }
}

function advanceScience(state, support, sendScholar) {
  const valid = disciplines.filter(key => state.automaScience[key] < 12 && state.playerScience[key] < 12)
  if (!valid.length) return { state, summary: '과학 진전 생략' }
  let target = state.scoring.discipline
  if (!sendScholar || support.science !== 'scoring-tile' || !valid.includes(target)) {
    const zero = valid.filter(key => state.automaScience[key] === 0)
    const options = zero.length ? zero : valid
    const gap = key => Math.abs(state.playerScience[key] - state.automaScience[key])
    const closest = Math.min(...options.map(gap))
    target = choose(options.filter(key => gap(key) === closest), support)
  }
  let slots = state.scholarSlots
  let gain = 1
  if (sendScholar) {
    const used = Object.values(slots).flat().filter(owner => owner === 'automa').length
    const index = slots[target].indexOf(null)
    if (used < 7 && index >= 0) {
      gain = index === 0 ? 3 : 2
      slots = { ...slots, [target]: slots[target].map((owner, i) => i === index ? 'automa' : owner) }
    }
  }
  const level = Math.min(12, state.automaScience[target] + gain)
  return { state: { ...state, scholarSlots: slots, automaScience: { ...state.automaScience, [target]: level } },
    summary: `${scienceNames[target]} ${state.automaScience[target]} → ${level}` }
}

function blockActions(state, support) {
  const blocked = { ...state.blocked }
  const selected = []
  for (const [key, options, name] of [['power', powerActionIds, '파워'], ['book', state.deal.bookActions, '도서']]) {
    const valid = options.filter(id => !blocked[key].includes(id))
    if (!valid.length) continue
    const id = choose(valid, support)
    blocked[key] = [...blocked[key], id]
    selected.push(`${name} ${id}번`)
  }
  return { state: { ...state, blocked }, summary: selected.length ? selected.join('·') + ' 봉쇄' : '봉쇄할 행동 없음' }
}

function takeInnovation(state, support) {
  const market = state.innovations
  if (state.round < 3 || market.automa.length >= 3 || !market.pool.length) {
    return { state, summary: '혁신 획득 생략' }
  }
  const id = choose(market.pool, support)
  return { state: { ...state, innovations: { ...market, automa: [...market.automa, id],
    pool: market.pool.filter(tile => tile !== id) } }, summary: `혁신 타일 ${id} 획득` }
}

function execute(state, action, card, support) {
  switch (action) {
    case 'transform-and-build':
    case 'upgrade': {
      const result = resolveAutomaBoardAction(state, action, state.automaDeck.support, state.round)
      let summary = '건설·개량 생략'
      if (result.action === 'transform-and-build') summary = `${result.hex} 작업장 건설 (${result.marked ? '표시' : '미표시'})`
      if (result.action === 'upgrade') summary = `${result.hex} ${buildingNames[result.building]} 개량`
      return { state: result.position, powerOffered: result.powerOffered, summary }
    }
    case 'block-power-book-action': return blockActions(state, support)
    case 'take-innovation': return takeInnovation(state, support)
    case 'advance-science-discipline': return advanceScience(state, support, false)
    case 'send-scholar': return advanceScience(state, support, true)
    case 'simpletons-points':
    case 'gain-victory-points': {
      const variable = difficultyLevels[state.deal.difficulty].variablePoints[Math.floor((state.round - 1) / 2)]
      const points = action === 'simpletons-points' || card.points === 'X' ? variable : card.points
      return { state: addPoints(state, points), summary: `승점 +${points}` }
    }
    default: throw new Error('지원하지 않는 오토마 행동입니다.')
  }
}

// Resolve the pair in printed action order. The turn controller gives the player the power decision.
export function botTurn(state) {
  const deck = drawPair(state.automaDeck)
  let next = { ...state, automaDeck: deck }
  const support = byId.get(deck.support).support
  if (deck.passed) return pass(next, support)
  const card = byId.get(deck.action)
  const actions = card.actions.flatMap(action =>
    action === 'faction-action' ? ['transform-and-build', 'simpletons-points'] : [action])
  let powerOffered = 0
  const summaries = []
  for (const action of actions) {
    const result = execute(next, action, card, support)
    next = result.state
    powerOffered += result.powerOffered ?? 0
    summaries.push(result.summary)
  }
  return { state: next, passed: false, powerOffered,
    summary: `단순족 · 행동 ${deck.action} / 지원 ${deck.support} · ${summaries.join(' · ')}` }
}
