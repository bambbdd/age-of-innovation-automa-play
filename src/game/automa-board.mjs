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
  if (faction === 'powermongers') options = bestHexes(options,hex=>-powerOffered(position,hex))
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
