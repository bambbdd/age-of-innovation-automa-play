import { smallBoard, nativeTerrains } from '../game/small-board.mjs'

// Retain compatible choices when the difficulty, planning display, or deal changes.
export function setupSelection(deal, previous = {}) {
  const offer = deal.planningOffers.find(o => o.terrain === previous.playerTerrain) ?? deal.planningOffers[0]
  const playerFaction = offer.factions.includes(previous.playerFaction) ? previous.playerFaction : offer.factions[0]
  const home = smallBoard.filter(cell => cell.terrain === offer.terrain).map(cell => cell.id)
  const count = playerFaction === 'monks' ? 1 : playerFaction === 'omar' ? 3 : 2
  const suggested = offer.terrain === 'mountain' ? ['A2','A8'] : []
  const hexes = [...new Set([...(previous.hexes ?? []),...suggested,...home])].filter(h=>home.includes(h)).slice(0,count)
  const terrain = previous.automaTerrain ?? 'desert'
  return { playerTerrain:offer.terrain, playerFaction, hexes,
    towerSlot:Math.min(previous.towerSlot ?? 2,count-1),
    automaTerrain: terrain === offer.terrain ? nativeTerrains.find(t=>t!==offer.terrain) : terrain,
    automaFaction:previous.automaFaction ?? 'simpletons',
    playerBonus:deal.bonusTiles.choices.includes(previous.playerBonus) ? previous.playerBonus : deal.bonusTiles.choices[0] }
}

export function startingPieces(selection) {
  return selection.hexes.map((hex,i) => {
    let building = 'workshop'
    if (selection.playerFaction === 'monks') building = 'university'
    if (selection.playerFaction === 'omar' && i === selection.towerSlot) building = 'tower'
    return {hex,building,...(building==='tower' ? {neutral:true} : {})}
  })
}
