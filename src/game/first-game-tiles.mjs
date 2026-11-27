import { adjacentLand, builtBridges } from './board-rules.mjs'

// Display order and IDs match the first two-player game's six tiles and the helper artwork.
export const starterInnovations = [5, 6, 7, 9, 10, 16]
export const starterPalaces = [7, 10, 17]
export const starterBookActions = [1, 3, 5]

const disciplines = ['banking', 'law', 'engineering', 'medicine']

export const innovationNames = {
  1: '무역로', 2: '기계 장치', 3: '교수진', 4: '건축학', 5: '인구 조사', 6: '도시 연맹', 7: '하수도',
  8: '증기력', 9: '대학 교육', 10: '도서관', 11: '중립 작업장', 12: '중립 양성소', 13: '중립 대학',
  14: '중립 궁전', 15: '기념물', 16: '통신망', 17: '강철', 18: '중립 교역소',
}

function citiesOwned(position) {
  if (position.cityTiles) return position.cityTiles.length
  return new Set(position.buildings.filter(b => b.owner === 'player' && b.cityId != null)
    .map(b => b.cityId)).size
}

function groupCount(position, pieces) {
  const remaining = new Set(pieces.map(b => b.hex))
  let groups = 0
  for (const first of remaining) {
    groups++
    const group = [first]
    remaining.delete(first)
    for (const hex of group) {
      for (const neighbor of adjacentLand(position, hex)) {
        if (remaining.delete(neighbor)) group.push(neighbor)
      }
    }
  }
  return groups
}

export function innovationPoints(position, id) {
  const pieces = position.buildings.filter(b => b.owner === 'player')
  switch (id) {
    case 4: return 10
    case 5: {
      if (pieces.length >= 11) return 18
      if (pieces.length >= 9) return 12
      return pieces.length >= 7 ? 8 : 0
    }
    case 6: return 5 * citiesOwned(position)
    case 7: return 2 * pieces.filter(b => b.building === 'workshop').length
    case 9: return 5 * pieces.filter(b => b.building === 'school').length
    case 10: {
      const [highest, second] = Object.values(position.playerScience).sort((a, b) => b - a)
      return highest + second
    }
    case 16: {
      const groups = groupCount(position, pieces)
      if (groups >= 6) return 18
      if (groups === 5) return 12
      return groups === 4 ? 8 : 0
    }
    case 15: return 7
    case 17: return [0,8,12,18][builtBridges(position).length]
    default:
      if (Object.hasOwn(innovationNames,id)) return 0
      throw new Error('알 수 없는 혁신입니다.')
  }
}

export function innovationCost(position, id) {
  const index = position.deal.innovations.indexOf(id)
  const count = position.innovations.player.length
  if (index < 0 || !position.innovations.pool.includes(id) || count >= 3) {
    throw new Error('개발할 수 없는 혁신입니다.')
  }
  const books = { banking: 0, law: 0, engineering: 0, medicine: 0 }
  // Upper row shares two disciplines per space. Each lower space has a single discipline.
  if (index < 2) {
    books[disciplines[index * 2]] = 2
    books[disciplines[index * 2 + 1]] = 2
  } else {
    books[disciplines[index - 2]] = 2
  }
  const extra = position.playerTerrain === 'wasteland' && count === 1 ? 0 : count
  const palaceBuilt = position.buildings.some(b => b.owner === 'player' && b.building === 'palace' && !b.neutral)
  return { coins: palaceBuilt ? 0 : 5, books, anyBooks: (index < 2 ? 1 : 3) + extra }
}

export const palaceRewards = {
  1: { name:'도구 궁전 · 도구 2개 행동', income:{power:5} },
  2: { name:'개척 궁전 · 삽 2개 행동' },
  3: { name:'재편 궁전 · 양성소를 교역소로 교체', income:{power:2} },
  4: { name:'교역소 궁전 · 작업장을 교역소로 무료 개량', income:{power:2} },
  5: { name:'적성 궁전 · 적성 타일 획득', income:{power:4} },
  6: { name:'학술 궁전 · 한 분야 두 칸까지 전진', income:{power:2,books:1} },
  7: { name: '양성소 궁전', income: { power: 4 }, passPerSchool: 3 },
  8: { name:'도시 궁전 · 파워 6으로 도시 설립', income:{coins:2,power:2,tools:1} },
  9: { name:'비행 궁전 · 학자 1명으로 비행', income:{scholars:1} },
  10: { name: '재정 궁전', income: { coins: 6 }, immediate: { power: 12, books: 2 } },
  11: { name:'자치 궁전 · 도시 타일 획득', income:{tools:1} },
  12: { name:'작업장 궁전 · 작업장 건설 시 2점', income:{power:8} },
  13: { name:'상업 궁전 · 교역소 건설 시 3점' },
  14: { name:'수로 궁전 · 항해 발전과 강 건너 도시 설립', income:{power:6} },
  15: { name:'토목 궁전 · 삽 2개, 다리 2개, 책 2권', income:{power:6} },
  16: { name:'개척 교역소 궁전 · 고향 지형에 무료 교역소', income:{power:2,books:1} },
  17: { name: '승점 궁전', income: { power: 2 }, immediate: { points: 10 } },
}

// These are named by effect so a player can choose without consulting the physical tiles.
export const cityRewards = {
  tools: { name: '4점 · 도구 3개', points: 4, tools: 3 },
  spades: { name: '5점 · 삽 2개로 지형 변환과 건설', points: 5, spades: 2 },
  books: { name: '5점 · 원하는 책 2권', points: 5, books: 2 },
  coins: { name: '6점 · 코인 6개', points: 6, coins: 6 },
  science: { name: '7점 · 네 과학 분야 각각 1칸', points: 7, eachScience: 1 },
  power: { name: '8점 · 파워 8', points: 8, power: 8 },
  scholar: { name: '8점 · 학자 1명', points: 8, scholars: 1 },
}

export const bookActions = {
  1: { name: '책 1권으로 파워 5', anyBooks: 1, reward: { power: 5 } },
  2: { name: '책 1권으로 한 과학 분야 2칸 전진', anyBooks: 1 },
  3: { name: '책 2권으로 교역소당 2점', anyBooks: 2, reward: { pointsPerGuild: 2 } },
  4: { name: '책 2권으로 작업장을 교역소로 무료 개량', anyBooks: 2 },
  5: { name: '책 2권으로 코인 6개', anyBooks: 2, reward: { coins: 6 } },
  6: { name: '책 3권으로 무료 삽 3개', anyBooks: 3, reward:{spades:3} },
}

export const competencyRewards = {
  1: { name: '수입마다 책 1권과 파워 1', income: { books: 1, power: 1 } },
  2: { name: '수입마다 3점과 코인 2개', income: { points: 3, coins: 2 } },
  3: { name: '수입마다 도구 1개와 과학 1칸', income: { tools: 1, scienceChoice: 1 } },
  4: { name: '라운드마다 행동으로 파워 4', special: { power: 4 } },
  5: { name: '즉시 삽 2개로 지형 변환과 건설', immediate: { spades: 2 } },
  6: { name: '즉시 도구 1개와 5점, 코인 2개', immediate: { tools: 1, points: 5, coins: 2 } },
  7: { name: '학자 파견마다 2점', trigger: 'send-scholar' },
  8: { name: '패스할 때 도시당 2점', trigger: 'pass-cities' },
  9: { name: '패스할 때 최저 과학 레벨만큼 득점', trigger: 'pass-science' },
  10: { name: '별관 2개를 받아 행동으로 배치', immediate: { annexes: 2 } },
  11: { name: '경계 칸에 작업장 건설 시 3점', trigger: 'workshop-on-border' },
  12: { name: '즉시 중립 탑 · 수입마다 파워 2와 코인 2개',
    immediate: { tower: 1 }, income: { power: 2, coins: 2 } },
}

export function competencyLocation(position, id) {
  const index = position.deal.competencies.indexOf(id)
  if (index < 0 || position.competencies.includes(id)) throw new Error('선택할 수 없는 적성 타일입니다.')
  const books = Math.floor(index / 4)
  return { discipline: disciplines[index % 4], levels: 3 - books, books }
}

export function tileIncome(position) {
  const rewards = {}
  const innovationIncome = {11:{tools:3}, 13:{points:2}, 14:{power:4}, 18:{coins:5}}
  const sources = [palaceRewards[position.palace], ...position.competencies.map(id => competencyRewards[id])]
  for (const id of position.innovations.player) sources.push({ income:innovationIncome[id] })
  for (const tile of sources) {
    for (const [kind, amount] of Object.entries(tile?.income ?? {})) {
      rewards[kind] = (rewards[kind] ?? 0) + amount
    }
  }
  return rewards
}

export function tilePassPoints(position) {
  const schools = position.buildings.filter(b => b.owner === 'player' && b.building === 'school').length
  let points = (palaceRewards[position.palace]?.passPerSchool ?? 0) * schools
  if (position.innovations.player.includes(1)) {
    points += 2 * position.buildings.filter(b => b.owner === 'player' && b.building === 'guild').length
  }
  if (position.competencies.includes(8)) points += 2 * citiesOwned(position)
  if (position.competencies.includes(9)) points += Math.min(...Object.values(position.playerScience))
  return points
}
