import cards from './data/decision-cards.json' with { type: 'json' }
import priorities from './data/terrain-priorities.json' with { type: 'json' }
import { smallBoard, shouldMarkNewWorkshop } from './small-board.mjs'
import { adjacentLand, landInReach, automaDistances, openBuildHexes, buildingPower,
  automaSailing, terrainAt, pieceAvailable, availableUpgrades } from './board-rules.mjs'

function bestHexes(hexes, value) {
  const values = hexes.map(value)
  const best = Math.min(...values)
  return hexes.filter((_, i) => values[i] === best)
}

export function directionalSelection(hexes, support) {
  const ordered = smallBoard.filter(cell => hexes.includes(cell.id)).map(cell => cell.id)
  if (support.direction === 'left-up') ordered.reverse()
  return ordered[(support.count - 1) % ordered.length]
}

function powerOffered(position, hex) {
  const adjacent = adjacentLand(position, hex)
  return position.buildings.filter(b => b.owner === 'player' && adjacent.has(b.hex))
    .reduce((sum, b) => sum + buildingPower(b), 0)
}

function upgrade(position, support, trace) {
  const options = new Map()
  for (const b of position.buildings) {
    if (b.owner !== 'automa') continue
    const [next] = availableUpgrades(position, b)
    if (next) options.set(b.hex, { next, current: b.building, power: powerOffered(position, b.hex) })
  }
  trace.upgradeable = [...options.keys()]
  if (options.size === 0) return { action: 'skip', position, trace }
  const besidePlayer = trace.upgradeable.filter(hex => {
    const option = options.get(hex)
    return option.current === 'workshop' && option.power > 0
  })
  trace.preferred = besidePlayer.length ? besidePlayer : trace.upgradeable
  trace.leastPower = bestHexes(trace.preferred, hex => options.get(hex).power)
  const hex = directionalSelection(trace.leastPower, support)
  const { next: building, power } = options.get(hex)
  const buildings = position.buildings.map(b => b.hex === hex ? { ...b, building } : b)
  return { action: 'upgrade', hex, building, powerOffered: power, trace, position: { ...position, buildings } }
}

// Resolves an ordinary board action using the support half of a decision card.
export function resolveAutomaBoardAction(position, action, supportCardId, round, faction = null) {
  const support = cards.find(card => card.id === supportCardId)?.support
  if (!support) throw new Error('Unknown support card')
  const sailing = automaSailing(position, round)
  const bot = position.buildings.filter(b => b.owner === 'automa')
  const trace = {}
  if (action === 'upgrade') return upgrade(position, support, trace)
  if (action !== 'transform-and-build') throw new Error('Unknown board action')
  if (!pieceAvailable(position, 'automa', 'workshop')) {
    trace.fallback = 'no-workshop'
    return upgrade(position, support, trace)
  }

  const marked = bot.filter(b => b.marked).map(b => b.hex)
  const unmarked = bot.filter(b => !b.marked).map(b => b.hex)
  const fromMarked = support.structure.startsWith('marked')
  const sources = bot.filter(b => b.marked === fromMarked)
  trace.reachable = faction === 'wanderers'
    ? smallBoard.filter(c=>c.terrain!=='river' && !position.buildings.some(b=>b.hex===c.id)).map(c=>c.id)
    : openBuildHexes(position, sources, sailing)
  if (trace.reachable.length === 0) {
    trace.fallback = 'no-reachable-hex'
    return upgrade(position, support, trace)
  }

  const toMarked = automaDistances(position, marked)
  const toUnmarked = automaDistances(position, unmarked)
  const distance = (map, hex) => map.get(hex) ?? Infinity
  trace.bringTogether = trace.reachable
  if (faction !== 'wanderers' && support.structure.endsWith('-reaching') && !marked.some(hex => {
    const reach = landInReach(position, hex, sailing)
    return unmarked.some(id => reach.has(id))
  })) {
    const shortest = Math.min(...marked.map(hex => distance(toUnmarked, hex)))
    // The new building joins its closer group. Measure to the opposite group.
    const closer = trace.reachable.filter(hex =>
      Math.max(distance(toMarked, hex), distance(toUnmarked, hex)) < shortest)
    if (closer.length) trace.bringTogether = closer
  }

  const playerPriority = faction === 'mimics' || faction === 'kuddlers'
  const order = priorities[support.terrainPriority][playerPriority ? position.playerTerrain : position.automaTerrain]
  const humans = position.buildings.filter(b => b.owner === 'player').map(b => b.hex)
  const toPlayer = automaDistances(position, humans)
  const closest = hex => distance(toPlayer,hex)
  const priority = hex => order.indexOf(terrainAt(position,hex))
  let options = trace.bringTogether
  if (faction === 'powermongers') options = trace.mostPower = bestHexes(options,hex=>-powerOffered(position,hex))
  if (faction === 'kuddlers') {
    trace.closestPlayer = bestHexes(options,closest)
    options = trace.terrain = bestHexes(trace.closestPlayer,priority)
  } else {
    trace.terrain = bestHexes(options,priority)
    options = trace.closestPlayer = bestHexes(trace.terrain,closest)
  }
  const hex = directionalSelection(options, support)
  trace.nearestMarked = distance(toMarked, hex)
  trace.nearestUnmarked = distance(toUnmarked, hex)
  const mark = shouldMarkNewWorkshop(trace.nearestMarked, trace.nearestUnmarked)
  const piece = { owner: 'automa', building: 'workshop', hex, marked: mark }
  const next = { ...position, buildings: [...position.buildings, piece] }
  if (terrainAt(position, hex) !== position.automaTerrain) {
    next.terrainChanges = { ...position.terrainChanges, [hex]: position.automaTerrain }
  }
  return { action, hex, building: 'workshop', marked: mark, powerOffered: powerOffered(position, hex),
    trace, position: next }
}

// Explain the actual candidate sets left by the solver, in the order used on this card.
export function explainBoardChoice(result,support,faction) {
  const {hex,trace,action} = result
  const reasons = []
  if (trace.fallback) reasons.push(trace.fallback==='no-workshop' ? '작업장 재고가 없어 개량으로 전환' : '건설할 빈 칸에 닿지 않아 개량으로 전환')
  if (action==='skip') return {hexes:[],reasons:[...reasons,'개량 가능한 건물이 없어 생략']}
  const direction = support.direction==='left-up' ? '오른쪽 아래부터 역방향' : '왼쪽 위부터 정방향'
  let finalists
  if (action==='upgrade') {
    reasons.push('개량 가능 '+trace.upgradeable.length+'칸', '인접 작업장 우선 적용 후 '+trace.preferred.length+'칸',
      '최소 제안 파워 '+result.powerOffered+' · '+trace.leastPower.length+'칸')
    finalists=trace.leastPower
  } else {
    const group=support.structure.startsWith('marked')?'표시 건물':'미표시 건물'
    reasons.push((faction==='wanderers'?'거리 제한 없는 빈 육지':group+'에서 도달 가능한 빈 육지')+' '+trace.reachable.length+'칸')
    if (trace.bringTogether.length<trace.reachable.length) reasons.push('두 건물군 사이 거리 단축 · '+trace.bringTogether.length+'칸')
    if (trace.mostPower) reasons.push('제안 파워 최대 · '+trace.mostPower.length+'칸')
    const terrain=(['kuddlers','mimics'].includes(faction)?'내':'오토마')+' 지형 순위 '+support.terrainPriority+' · '+trace.terrain.length+'칸'
    const near='내 건물에 가장 가까운 후보 '+trace.closestPlayer.length+'칸'
    if (faction==='kuddlers') reasons.push(near,terrain)
    else reasons.push(terrain,near)
    finalists=faction==='kuddlers'?trace.terrain:trace.closestPlayer
  }
  reasons.push(finalists.length===1 ? '남은 한 칸 '+hex+' 선택' : direction+' '+support.count+'번째로 '+hex+' 선택')
  if (action==='transform-and-build') {
    const distance=n=>Number.isFinite(n)?n:'도달 불가'
    reasons.push('표시 건물까지 '+distance(trace.nearestMarked)+' · 미표시 건물까지 '+distance(trace.nearestUnmarked)
      +' → '+(result.marked?'표식 배치':trace.nearestMarked===trace.nearestUnmarked?'동거리이므로 미표시':'미표시'))
  }
  return {hexes:[hex],reasons}
}
