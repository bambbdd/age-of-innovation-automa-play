import { smallBoard, bridgeSites, nativeTerrains } from './small-board.mjs'
import { difficultyLevels } from './setup.mjs'

const cells = new Map(smallBoard.map(cell => [cell.id, cell]))
const neighbors = new Map(smallBoard.map(cell => [cell.id, smallBoard.filter(other =>
  Math.max(Math.abs(cell.q - other.q), Math.abs(cell.r - other.r),
    Math.abs(cell.q + cell.r - other.q - other.r)) === 1).map(other => other.id)]))
const power = { workshop: 1, guild: 2, school: 2, palace: 3, university: 3, tower: 2, monument: 4 }
export const buildingSupply = { workshop: 9, guild: 4, school: 3, palace: 1, university: 1 }
const upgrades = { workshop: ['guild'], guild: ['palace', 'school'], school: ['university'] }

export function placedFromSupply(position, owner, type) {
  return position.buildings.filter(b => b.owner === owner && b.building === type && !b.neutral).length
}

export function pieceAvailable(position, owner, type) {
  return placedFromSupply(position,owner,type) < buildingSupply[type]
}

export function availableUpgrades(position, piece) {
  if (piece.neutral) return []
  return (upgrades[piece.building] ?? []).filter(type => pieceAvailable(position, piece.owner, type))
}

export function upgradePlayerBuilding(position, hex, building) {
  const piece = position.buildings.find(b => b.hex === hex && b.owner === 'player')
  if (!piece || !availableUpgrades(position, piece).includes(building)) throw new Error('Unavailable upgrade')
  return { ...position, buildings: position.buildings.map(b => b === piece ? { ...b, building } : b) }
}

export function terrainAt(position, hex) {
  return position.terrainChanges?.[hex] ?? cells.get(hex)?.terrain
}

export function builtBridges(position) {
  return position.builtBridges ?? position.deal?.builtBridges ?? []
}

function sameSpan([a, b], from, to) {
  return (a === from && b === to) || (a === to && b === from)
}

// A bridge spans the shared side of two neighboring hexes. The Moles may
// bridge that side even when either or both of the hexes are land.
export const moleBridgeSites = smallBoard.flatMap((a, index) => a.terrain === 'river' ? [] :
  smallBoard.slice(index+1).filter(b => b.terrain !== 'river' && !neighbors.get(a.id).includes(b.id) &&
    neighbors.get(a.id).filter(id=>neighbors.get(b.id).includes(id)).length === 2).map(b=>[a.id,b.id]))

export function placeBridge(position, owner, from, to, { moleAction = false } = {}) {
  if (owner !== 'player') throw new Error('Only the player can build bridges')
  const spans = builtBridges(position)
  if (moleAction && position.playerFaction !== 'moles') throw new Error('두더지족의 다리 행동입니다.')
  const sites = moleAction ? moleBridgeSites : bridgeSites
  if (!sites.some(site => sameSpan(site, from, to)) || spans.some(site => sameSpan(site, from, to))) {
    throw new Error('Unavailable bridge site')
  }
  if (!position.buildings.some(b => b.owner === owner && [from, to].includes(b.hex))) {
    throw new Error('A bridge needs an owned building at one end')
  }
  return { ...position, builtBridges: [...spans, [from, to]] }
}

export function adjacentLand(position, from) {
  const land = neighbors.get(from).filter(id => cells.get(id).terrain !== 'river')
  for (const [a, b] of builtBridges(position)) {
    if (a === from) land.push(b)
    if (b === from) land.push(a)
  }
  return new Set(land)
}

export function landInReach(position, from, sailing) {
  if (!Number.isInteger(sailing) || sailing < 0) throw new Error('Invalid sailing value')
  const land = adjacentLand(position, from)
  let frontier = [from]
  const visited = new Set([from])
  for (let step = 1; step <= sailing && frontier.length; step++) {
    const rivers = []
    for (const hex of frontier) {
      for (const next of neighbors.get(hex)) {
        if (cells.get(next).terrain !== 'river' || visited.has(next)) continue
        visited.add(next)
        rivers.push(next)
        for (const bank of neighbors.get(next)) {
          if (cells.get(bank).terrain !== 'river') land.add(bank)
        }
      }
    }
    frontier = rivers
  }
  land.delete(from)
  return land
}

// Flood outward from all targets. Player buildings may be endpoints only.
// The printed distance counts intervening hexes, hence adjacent endpoints are zero apart.
export function automaDistances(position, targets) {
  const blocked = new Set(position.buildings.filter(b => b.owner === 'player').map(b => b.hex))
  const queue = [...new Set(targets)]
  const steps = new Map(queue.map(hex => [hex, 0]))
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]
    for (const hex of neighbors.get(from)) {
      if (steps.has(hex) || blocked.has(hex)) continue
      steps.set(hex, steps.get(from) + 1)
      queue.push(hex)
    }
  }
  return new Map([...steps].map(([hex, n]) => [hex, Math.max(0, n - 1)]))
}

export function openBuildHexes(position, buildings, sailing) {
  const reachable = new Set()
  for (const { hex } of buildings) {
    for (const id of landInReach(position, hex, sailing)) reachable.add(id)
  }
  for (const { hex } of position.buildings) reachable.delete(hex)
  for (const hex of position.botSpecial?.tools ?? []) reachable.delete(hex)
  return smallBoard.filter(c => reachable.has(c.id)).map(c => c.id)
}

export function buildingPower(piece) {
  if (!Object.hasOwn(power, piece.building)) throw new Error('Unknown building')
  return power[piece.building] + (piece.annex ? 1 : 0)
}

function connectedGroups(position, owner, connections) {
  const remaining = new Map(position.buildings.filter(b => b.owner === owner).map(b => [b.hex, b]))
  const groups = []
  for (const first of remaining.values()) {
    const group = [first]
    remaining.delete(first.hex)
    for (let i = 0; i < group.length; i++) {
      for (const hex of connections(group[i].hex)) {
        if (!remaining.has(hex)) continue
        group.push(remaining.get(hex))
        remaining.delete(hex)
      }
    }
    groups.push(group)
  }
  return groups
}

// Existing cities absorb newly connected buildings. Only entirely unclaimed groups can found cities.
export function newCityGroups(position, minimumPower = 7) {
  return connectedGroups(position, 'player', hex => adjacentLand(position, hex)).filter(group => {
    if (group.some(b => b.cityId != null)) return false
    const types = group.map(b => b.building)
    const required = types.includes('monument') ? 2 : types.includes('university') ? 3 : 4
    const count = group.length + group.filter(b => b.annex).length
    return count >= required && group.reduce((sum, b) => sum + buildingPower(b), 0) >= minimumPower
  }).map(group => group.map(b => b.hex))
}

export function foundCities(position, minimumPower = 7) {
  const cities = newCityGroups(position, minimumPower)
  if (!cities.length) return { position, cities }
  const cityByHex = new Map()
  for (const group of cities) {
    const id = group[0]
    for (const hex of group) cityByHex.set(hex, id)
  }
  const buildings = position.buildings.map(b => cityByHex.has(b.hex) ? { ...b, cityId: cityByHex.get(b.hex) } : b)
  return { position: { ...position, buildings }, cities }
}

export function automaSailing(position, round) {
  if (!Number.isInteger(round) || round < 1 || round > 6) throw new Error('Invalid round')
  return difficultyLevels[position.deal.difficulty].sailing[Math.floor((round - 1) / 2)]
}

export function areaScoring(position, playerSailing, { flight = false } = {}) {
  const sizes = {}
  for (const owner of ['player', 'automa']) {
    const sailing = owner === 'player' ? playerSailing : automaSailing(position, 6)
    const groups = connectedGroups(position, owner, hex => {
      const connected = landInReach(position, hex, sailing)
      if (owner === 'player' && (flight || position.playerFaction === 'moles')) {
        let frontier = [hex]
        for (let step = 0; step < (flight ? 3 : 2); step++) {
          frontier = [...new Set(frontier.flatMap(id => neighbors.get(id)))]
          for (const id of frontier) connected.add(id)
        }
      }
      return connected
    })
    sizes[owner] = Math.max(0, ...groups.map(g => g.length))
  }
  const tied = sizes.player === sizes.automa
  const player = tied ? 15 : sizes.player > sizes.automa ? 18 : 12
  return { sizes, points: { player, automa: 30 - player } }
}

// Clockwise on the printed planning display (basic rules, p. 11).
export const terrainCircle = ['desert', 'plains', 'swamp', 'lake', 'forest', 'mountain', 'wasteland']

export function canTravel(position, hex, travel) {
  if (!(travel === 'tunnel' && position.playerFaction === 'moles' || travel === 'flight' && position.palace === 9)) return false
  if (position.botSpecial?.tools?.includes(hex) || !cells.has(hex) || cells.get(hex).terrain === 'river' || position.buildings.some(b=>b.hex===hex)) return false
  const owned = position.buildings.filter(b=>b.owner==='player')
  if (owned.some(b=>adjacentLand(position,b.hex).has(hex))) return false
  let frontier = owned.map(b=>b.hex)
  for (let step=0; step < (travel === 'flight' ? 3 : 2); step++) {
    frontier = [...new Set(frontier.flatMap(id=>neighbors.get(id)))]
    if (frontier.includes(hex)) return true
  }
  return false
}

export function spadesBetween(from, to) {
  const distance = Math.abs(terrainCircle.indexOf(from) - terrainCircle.indexOf(to))
  return Math.min(distance, terrainCircle.length - distance)
}

// One target of an ordinary Terraform and Build action. Resource payment belongs to the turn engine.
export function terraformAndBuild(position, hex, sailing, { terrain = position.playerTerrain, build = true, travel } = {}) {
  const player = position.buildings.filter(b => b.owner === 'player')
  const reached = travel ? canTravel(position,hex,travel) : openBuildHexes(position,player,sailing).includes(hex)
  if (!reached) throw new Error('Hex occupied or out of reach')
  const from = terrainAt(position, hex)
  if (!nativeTerrains.includes(terrain)) throw new Error('Unknown terrain')
  const spades = spadesBetween(from, terrain)
  if (spades + spadesBetween(terrain, position.playerTerrain) !== spadesBetween(from, position.playerTerrain)) {
    throw new Error('Terraform towards native terrain')
  }
  if (build && terrain !== position.playerTerrain) throw new Error('Workshop requires native terrain')
  if (!build && spades === 0) throw new Error('No terrain change')
  if (build && !pieceAvailable(position, 'player', 'workshop')) {
    throw new Error('No workshop available')
  }
  const next = { ...position }
  if (spades) next.terrainChanges = { ...position.terrainChanges, [hex]: terrain }
  if (build) next.buildings = [...position.buildings, { owner: 'player', building: 'workshop', hex }]
  return { position: next, spades }
}
