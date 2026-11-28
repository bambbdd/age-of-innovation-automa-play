import { labels, subjects } from '../game/first-game.mjs'
import { spadesBetween, terrainCircle } from '../game/board-rules.mjs'

const root = './public/components'
const pieceColors = ['desert','wasteland','swamp','lake','forest','plains','mountain','neutral']
const pieceTypes = ['workshop','guild','palace','school','university','scholar','marker','tower','monument']

export function art(group, id, alt = '') {
  const png = ['science-discipline','ship-level','resources'].includes(group)
  return `<img class="component-art" src="${root}/${group}/${id}.${png?'png':'webp'}" alt="${alt}"${alt ? ` title="${alt}"` : ''}>`
}

export function wood(type, terrain) {
  const x = pieceColors.indexOf(terrain) * 100 / (pieceColors.length - 1)
  const y = pieceTypes.indexOf(type) * 100 / (pieceTypes.length - 1)
  return `<span aria-hidden="true" class="wood" style="background-position:${x}% ${y}%"></span>`
}

export function scoreArt(deal, round) {
  const id = deal.scoreTiles.rounds[round-1]
  const base = art('round-score', id + (round <= 3 ? '-123' : '-456'))
  const overlay = round === 6 ? art('round-score-final',deal.scoreTiles.final) : ''
  return `<span class="score-tile">${base}${overlay}</span>`
}

export function terrainWheel(home) {
  const start=terrainCircle.indexOf(home)
  const tiles=terrainCircle.map((_,step)=>{
    const terrain=terrainCircle[(start+step)%terrainCircle.length]
    const angle=2*Math.PI*step/terrainCircle.length
    const x=50+38*Math.sin(angle), y=50-38*Math.cos(angle)
    const cost=spadesBetween(terrain,home)
    const label=labels[terrain]+(step===0?' (고향)':'')+' · 삽 '+cost+'개'
    return `<li style="left:${x}%;top:${y}%"><span role="img" aria-label="${label}" title="${label}">${art('terrain',terrain)}<b aria-hidden="true">${cost}</b></span></li>`
  }).join('')
  return `<section class="terraform-guide"><h2>고향 지형 개척</h2><div class="terrain-wheel"><span class="wheel-unit">필요한 삽</span><ul aria-label="고향 지형(${labels[home]})으로 개척하는 비용">${tiles}</ul></div></section>`
}

export function choiceArt(a,s) {
  const tiles = {innovation:'innovation',book:'book-action',competency:'competency',palace:'palace',city:'city',power:'power-action',pass:'round-bonus'}
  if (tiles[a.kind] && a.id) return art(tiles[a.kind],a.id)
  if (a.kind==='tile-action') return art(a.source,a.id)
  if (a.kind==='special' && a.source==='bonus') return art('round-bonus',s.bonusTiles.player)
  if (a.kind==='special' && a.source==='competency') return art('competency',4)
  if (a.kind==='key') return art('resources','key')
  if (a.track==='sailing') return art('ship-level',Math.min(3,s.sailing+1))
  if (a.track==='terraforming') return art('spade-cost',Math.max(1,2-s.terraforming))
  if (a.discipline) return art(['choose-book','pay-book'].includes(a.kind)?'books':'science-discipline',a.discipline)
  if (a.kind==='terraform' && !a.build) return art('terrain',a.terrain)
  if (a.building) return wood(a.building,a.effect==='neutral'?'neutral':s.playerTerrain)
  if (a.build || a.kind==='finish-build') return wood('workshop',s.playerTerrain)
  return ''
}

// Optical centers of the printed spaces on the 440 × 672 science display.
const levelY = [519,474,440,395,361,314,279,235,192,161,132,102,47]
const columnX = [63,166,268,369]

export function scienceBoard(s) {
  const markers = []
  function place(x,y,who,type,label) {
    const terrain = who==='player' ? s.playerTerrain : s.automaTerrain
    markers.push(`<span class="track-piece" role="img" aria-label="${label}" title="${label}" style="left:${x/440*100}%;top:${y/672*100}%">${wood(type,terrain)}</span>`)
  }
  for (const [i,subject] of subjects.entries()) {
    const x = columnX[i]
    const tied = s.playerScience[subject]===s.automaScience[subject]
    for (const who of ['player','automa']) {
      const level = s[who+'Science'][subject]
      const offset = tied ? (who==='player' ? -11 : 14) : 4
      place(x+offset,levelY[level],who,'marker',`${labels[subject]} · ${who==='player'?'플레이어':'오토마'} ${level}단계`)
    }
    s.scholarSlots[subject].forEach((who,slot)=>{
      if (who) place(x+(slot%2 ? 23 : -23),slot<2 ? 574 : 637,who,'scholar',`${labels[subject]} · ${who==='player'?'플레이어':'오토마'} 학자 +${slot===0?3:2}`)
    })
  }
  const headings = subjects.map(key=>`<span>${labels[key]}</span>`).join('')
  return `<figure class="science-figure"><div class="science-headings" aria-hidden="true">${headings}</div><div class="science-board"><img class="science-print" src="${root}/science-board.webp" alt="은행학, 법학, 공학, 의학 순서의 과학 트랙">${markers.join('')}</div>
    <figcaption class="component-key"><span>${wood('marker',s.playerTerrain)}플레이어</span><span>${wood('marker',s.automaTerrain)}오토마</span></figcaption></figure>`
}
