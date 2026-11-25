import { adjacentLand } from './board-rules.mjs'
import { smallBoard } from './small-board.mjs'

export const disciplines = ['banking', 'law', 'engineering', 'medicine']
const zeroTracks = () => Object.fromEntries(disciplines.map(name => [name, 0]))

// IDs match the ten printed tiles in the reference helper.
export const bonusTiles = {
  1: { label: '항해 +1 · 강 옆 작업장 2점', income: {} },
  2: { label: '학자 1명 · 학자 파견 2점', income: { scholars: 1 } },
  3: { label: '책 1권 · 무료 삽 1개', income: { books: 1 }, special: 'spade' },
  4: { label: '책 1권 · 무료 다리', income: { books: 1 }, special: 'bridge' },
  5: { label: '도구 1개 · 패스 시 궁전과 대학당 4점', income: { tools: 1 } },
  6: { label: '도구 2개 · 과학 1칸', income: { tools: 2 }, special: 'science' },
  7: { label: '마력 4 · 동전 2개', income: { power: 4, coins: 2 } },
  8: { label: '동전 6개', income: { coins: 6 } },
  9: { label: '마력 3 · 길드 건설 3점', income: { power: 3 } },
  10: { label: '동전 4개 · 패스 시 학교당 과학 1칸', income: { coins: 4 } },
}

export function initializeEconomy(state) {
  if (state.playerTerrain !== 'mountain' || state.playerFaction !== 'navigators') {
    throw new Error('첫 플레이는 산 계획판과 항해사로 진행합니다.')
  }
  state.resources = { coins: 15, tools: 3, scholars: 0, bowls: [5, 7, 0], books: zeroTracks() }
  state.playerScience = zeroTracks()
  state.keys = 0
  state.sailing = 0
  state.terraforming = 0
  state.bookChoices = 0
  advanceScience(state, 'law', 3)
  return state
}

function quantity(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('수량은 0 이상의 정수여야 합니다.')
}

function checkDiscipline(name) {
  if (!disciplines.includes(name)) throw new Error('과학 분야를 선택하세요.')
}

// A single payment is checked in full before any tokens move.
export function pay(state, cost) {
  const resources = state.resources
  for (const [name, amount] of Object.entries(cost)) {
    if (name === 'books') {
      for (const [discipline, n] of Object.entries(amount)) {
        checkDiscipline(discipline)
        quantity(n)
        if (resources.books[discipline] < n) throw new Error('해당 분야의 책이 부족합니다.')
      }
      continue
    }
    if (!['coins', 'tools', 'scholars', 'power'].includes(name)) throw new Error('알 수 없는 지불 자원입니다.')
    quantity(amount)
    const available = name === 'power' ? resources.bowls[2] : resources[name]
    if (amount > available) throw new Error('행동에 필요한 자원이 부족합니다.')
  }
  for (const name of ['coins', 'tools', 'scholars']) resources[name] -= cost[name] ?? 0
  for (const [discipline, n] of Object.entries(cost.books ?? {})) resources.books[discipline] -= n
  const power = cost.power ?? 0
  resources.bowls[2] -= power
  resources.bowls[0] += power
}

export function chargePower(state, amount) {
  quantity(amount)
  const bowls = state.resources.bowls
  const first = Math.min(amount, bowls[0])
  bowls[0] -= first
  bowls[1] += first
  const second = Math.min(amount - first, bowls[1])
  bowls[1] -= second
  bowls[2] += second
  return first + second
}

export function offerPower(state, amount, accept) {
  quantity(amount)
  if (!accept) return 0
  const received = chargePower(state, Math.min(amount, state.points.player + 1))
  state.points.player -= Math.max(0, received - 1)
  return received
}

export function gainScholars(state, n) {
  quantity(n)
  const committed = Object.values(state.scholarSlots ?? {}).flat().filter(owner => owner === 'player').length
  const gained = Math.min(n, 7 - committed - state.resources.scholars)
  state.resources.scholars += gained
  return gained
}

export function chooseBook(state, discipline) {
  checkDiscipline(discipline)
  if (state.bookChoices <= 0) throw new Error('지금 선택할 책이 없습니다.')
  state.resources.books[discipline]++
  state.bookChoices--
}

export function advanceScience(state, discipline, levels, { useKey = true } = {}) {
  checkDiscipline(discipline)
  quantity(levels)
  const before = state.playerScience[discipline]
  const ceiling = state.automaScience?.[discipline] === 12 ? 11 : 12
  let after = Math.min(before + levels, ceiling)
  if (before < 8 && after >= 8) {
    if (state.keys > 0 && useKey) state.keys--
    else after = 7
  }
  for (const [threshold, power] of [[3, 1], [5, 2], [7, 2], [12, 3]]) {
    if (before < threshold && after >= threshold) chargePower(state, power)
  }
  state.playerScience[discipline] = after
  return after - before
}

export function collectIncome(state) {
  const pieces = state.buildings.filter(b => b.owner === 'player' && !b.neutral)
  const count = type => pieces.filter(b => b.building === type).length
  const workshops = count('workshop')
  const guilds = count('guild')
  const bonus = bonusTiles[state.bonusTiles.player].income
  // The fifth workshop reveals a blank space. The mountain board has an unconditional two-coin income.
  state.resources.tools += 1 + workshops - Number(workshops >= 5) + (bonus.tools ?? 0)
  state.resources.coins += 2 + 2 * guilds + Number(guilds > 0) + (bonus.coins ?? 0)
  gainScholars(state, count('school') + count('university') + (bonus.scholars ?? 0))
  chargePower(state, guilds + Math.max(0, guilds - 2) + (bonus.power ?? 0))
  state.bookChoices += bonus.books ?? 0
  if (state.playerScience.banking >= 9) state.resources.coins += 3
  if (state.playerScience.law >= 9) chargePower(state, 6)
  if (state.playerScience.engineering >= 9) state.resources.tools++
  if (state.playerScience.medicine >= 9) state.points.player += 3
}

export function buildingCost(state, hex, type, spades = 0) {
  quantity(spades)
  const costs = {
    workshop: { coins: 2, tools: 1 },
    school: { coins: 5, tools: 3 },
    university: { coins: 8, tools: 5 },
    palace: { coins: 6, tools: 4 },
  }
  let base = costs[type]
  if (type === 'guild') {
    const adjacent = adjacentLand(state, hex)
    const neighbor = state.buildings.some(b => b.owner === 'automa' && adjacent.has(b.hex))
    base = { coins: neighbor ? 3 : 6, tools: 2 }
  } else if (type == null) base = { coins: 0, tools: 0 }
  if (!base) throw new Error('건물 종류를 확인하세요.')
  return { coins: base.coins, tools: base.tools + spades * (3 - state.terraforming) }
}

export function effectiveSailing(state) {
  return state.sailing + Number(state.bonusTiles.player === 1)
}

export function advanceTrack(state, track) {
  if (track === 'sailing') {
    if (state.sailing >= 3) throw new Error('항해가 이미 최고 단계입니다.')
    pay(state, { coins: 4, scholars: 1 })
    state.sailing++
    if (state.sailing === 2) state.bookChoices += 2
    else state.points.player += state.sailing === 1 ? 2 : 4
  } else if (track === 'terraforming') {
    if (state.terraforming >= 2) throw new Error('지형 변환이 이미 최고 단계입니다.')
    pay(state, { coins: 5, tools: 1, scholars: 1 })
    state.terraforming++
    if (state.terraforming === 1) state.bookChoices += 2
    else state.points.player += 6
  } else throw new Error('발전시킬 트랙을 선택하세요.')
}

const rivers = smallBoard.filter(cell => cell.terrain === 'river')
export function navigatorsRiverPoints(state, hex) {
  const cell = smallBoard.find(c => c.id === hex)
  if (!cell || cell.terrain === 'river') return 0
  const onBank = rivers.some(r => Math.max(Math.abs(r.q - cell.q), Math.abs(r.r - cell.r),
    Math.abs(r.q + r.r - cell.q - cell.r)) === 1)
  return onBank ? 2 * (Number(state.playerFaction === 'navigators') + Number(state.bonusTiles.player === 1)) : 0
}

export function bonusPassPoints(state) {
  if (state.bonusTiles.player !== 5) return 0
  return 4 * state.buildings.filter(b => b.owner === 'player' && ['palace', 'university'].includes(b.building)).length
}

export const resourceConversions = {
  sacrifice: '마력 II 2개 → III 1개',
  powerScholar: '마력 5 → 학자 1명',
  powerBook: '마력 5 → 책 1권',
  powerTool: '마력 3 → 도구 1개',
  powerCoin: '마력 1 → 동전 1개',
  scholarTool: '학자 1명 → 도구 1개',
  toolCoin: '도구 1개 → 동전 1개',
  bookCoin: '책 1권 → 동전 1개',
}

export function convertResource(state, id, discipline) {
  const res = state.resources
  switch (id) {
    case 'sacrifice':
      if (res.bowls[1] < 2) throw new Error('마력 그릇 II에 토큰 2개가 필요합니다.')
      res.bowls[1] -= 2
      res.bowls[2]++
      break
    case 'powerScholar': {
      const committed = Object.values(state.scholarSlots ?? {}).flat().filter(owner => owner === 'player').length
      if (res.scholars + committed >= 7) throw new Error('공급처에 남은 학자가 없습니다.')
      pay(state, { power: 5 })
      res.scholars++
      break
    }
    case 'powerBook':
      checkDiscipline(discipline)
      pay(state, { power: 5 })
      res.books[discipline]++
      break
    case 'powerTool': pay(state, { power: 3 }); res.tools++; break
    case 'powerCoin': pay(state, { power: 1 }); res.coins++; break
    case 'scholarTool': pay(state, { scholars: 1 }); res.tools++; break
    case 'toolCoin': pay(state, { tools: 1 }); res.coins++; break
    case 'bookCoin':
      checkDiscipline(discipline)
      pay(state, { books: { [discipline]: 1 } })
      res.coins++
      break
    default: throw new Error('교환 방법을 확인하세요.')
  }
}

export function remainingResourcePoints(state) {
  const { coins, tools, scholars, books, bowls } = state.resources
  const convertible = coins + tools + scholars + Object.values(books).reduce((sum, n) => sum + n, 0)
    + bowls[2] + Math.floor(bowls[1] / 2)
  return Math.floor(convertible / 5)
}
