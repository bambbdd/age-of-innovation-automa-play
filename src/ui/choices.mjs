import { play, subjects, labels, actionDescription } from '../game/first-game.mjs'
import { smallBoard, bridgeSites, nativeTerrains } from '../game/small-board.mjs'
import { availableUpgrades, openBuildHexes, canTravel, moleBridgeSites, terrainAt, terraformAndBuild } from '../game/board-rules.mjs'
import { buildingCost, effectiveSailing, resourceConversions, bonusTiles } from '../game/player-economy.mjs'
import { cityRewards, innovationCost, innovationPoints, competencyLocation } from '../game/first-game-tiles.mjs'

import { neutralSites, tileChoices, tileSpecials, riverCityActions } from '../game/tile-effects.mjs'

export const categories = ['보드','과학·발전','혁신·책','파워·특수','자원 교환','패스']
const forSubject = kind => subjects.map(discipline=>({kind,discipline}))
const dry = smallBoard.filter(c=>c.terrain !== 'river').map(c=>c.id)
const boardMessages = {
  'Hex occupied or out of reach':'비어 있고 항해 범위 안인 육지를 선택하세요.',
  'Terraform towards native terrain':'고향 지형에 가까워지는 방향으로만 변환할 수 있습니다.',
  'Unavailable upgrade':'개량에 필요한 건물이 남아 있지 않습니다.',
  'Unavailable bridge site':'다리를 건설할 수 없는 자리입니다.',
  'No workshop available':'건설할 작업장이 남아 있지 않습니다.',
}

function withTravel(s,hex,actions) {
  if (s.phase !== 'actions') return actions
  const extras = []
  for (const travel of ['flight','tunnel']) {
    if (canTravel(s,hex,travel)) extras.push(...actions.map(a=>({...a,travel})))
  }
  return [...actions,...extras]
}

function choicesForHex(s,hex,build = true) {
  const piece = s.buildings.find(b=>b.hex===hex)
  if (piece) {
    if (!build || piece.owner !== 'player') return []
    const options = availableUpgrades(s,piece).map(building=>({kind:'upgrade',hex,building}))
    if (s.annexes) options.push({kind:'annex',hex})
    return options
  }
  const terraforms = nativeTerrains.filter(t=>t!==terrainAt(s,hex)).map(terrain=>({kind:'terraform',hex,terrain,build:false}))
  const options = build ? [{kind:'terraform',hex,terrain:s.playerTerrain,build:true},...terraforms] : terraforms
  return withTravel(s,hex,options)
}

export function suggestions(s,category,hex) {
  const p = s.pending[0]
  if (s.bookChoices) return forSubject('choose-book')
  if (p) {
    switch (p.kind) {
      case 'tile-choice': return tileChoices(s,p).filter(a=>!hex || !actionHexes(a).length || actionHexes(a).includes(hex))
      case 'power-offer': case 'key': return [{kind:p.kind,accept:true},{kind:p.kind,accept:false}]
      case 'science': case 'pay-book': return forSubject(p.kind)
      case 'spades': {
        const options = hex && p.left ? choicesForHex(s,hex,false) : []
        const buildHex=p.freeWorkshop ? hex : p.first ?? hex
        if (buildHex && s.phase === 'actions' && terrainAt(s,buildHex)===s.playerTerrain) {
          const finish = {kind:'finish-build',hex:buildHex}
          if (p.firstTravel && p.first===buildHex) options.push(finish)
          else options.push(...withTravel(s,buildHex,[finish]))
        }
        options.push({kind:'skip'})
        return options
      }
      case 'competency': return s.deal.competencies.map(id=>({kind:p.kind,id}))
      case 'palace': return s.deal.palaces.map(id=>({kind:p.kind,id}))
      case 'city': return Object.keys(cityRewards).map(id=>({kind:p.kind,id}))
      case 'tower': {
        const sites=neutralSites(s)
        if (!sites.length) return [{kind:p.kind,skip:true}]
        return sites.includes(hex) ? [{kind:p.kind,hex}] : []
      }
    }
  }
  if (s.actor === 'automa') return [{kind:'automa'}]
  if (s.actionTaken && category !== '자원 교환') return [...riverCityActions(s),{kind:'end-turn'}]
  switch (category) {
    case '보드': return [...(hex && dry.includes(hex) ? choicesForHex(s,hex) : []),...riverCityActions(s).filter(a=>!hex || a.hex===hex)]
    case '과학·발전': {
      const options = ['sailing','terraforming'].map(track=>({kind:'track',track}))
      for (const discipline of subjects) {
        const slots = s.scholarSlots[discipline]
        for (const slot of [-1,0,slots.findIndex((v,i)=>i>0 && v===null)].filter((v,i,l)=>l.indexOf(v)===i)) {
          options.push({kind:'scholar',discipline,slot})
        }
      }
      return options
    }
    case '혁신·책': return [...s.innovations.pool.map(id=>({kind:'innovation',id})),...s.deal.bookActions.map(id=>({kind:'book',id}))]
    case '파워·특수': {
      const options = [...[2,3,4,5,6].map(id=>({kind:'power',id})),...tileSpecials(s)]
      const special = bonusTiles[s.bonusTiles.player].special
      if (special === 'science') options.push(...forSubject('special').map(a=>({...a,source:'bonus'})))
      if (special === 'spade') options.push({kind:'special',source:'bonus'})
      if (s.competencies.includes(4)) options.push({kind:'special',source:'competency'})
      if (['psychics','philosophers'].includes(s.playerFaction)) options.push({kind:'special',source:s.playerFaction})
      if (s.playerFaction === 'moles') {
        const owned = new Set(s.buildings.filter(b=>b.owner==='player').map(b=>b.hex))
        for (const [from,to] of moleBridgeSites) {
          if (owned.has(from) || owned.has(to)) options.push({kind:'mole-bridge',from,to})
        }
      }
      for (const [from,to] of bridgeSites.filter(pair=>pair.some(id=>s.buildings.some(b=>b.hex===id&&b.owner==='player')))) {
        options.push({kind:'power',id:1,from,to})
        if (special === 'bridge') options.push({kind:'special',source:'bonus',from,to})
      }
      return options.filter(a=>!hex || !actionHexes(a).length || actionHexes(a).includes(hex))
    }
    case '자원 교환': return Object.keys(resourceConversions).flatMap(id=>['bookCoin','powerBook'].includes(id)
      ? subjects.map(discipline=>({kind:'convert',id,discipline})) : [{kind:'convert',id}])
    case '패스': return s.round===6 ? [{kind:'pass'}] : s.bonusTiles.pool.map(t=>({kind:'pass',id:t.id}))
    default: return []
  }
}

export function actionInfo(s,a) {
  if (a.kind === 'terraform' || a.kind === 'upgrade') {
    let spades = 0
    if (a.kind === 'terraform') spades = terraformAndBuild(s,a.hex,effectiveSailing(s),a).spades
    const free = s.pending[0]?.kind === 'spades' ? s.pending[0].left : 0
    const cost = buildingCost(s,a.hex,a.building ?? (a.build ? 'workshop' : null),Math.max(0,spades-free))
    const tools = cost.tools + Number(a.travel === 'tunnel')
    return [spades && `삽 ${spades}`,tools && `도구 ${tools}`,cost.coins && `코인 ${cost.coins}`,
      a.travel === 'flight' && '학자 1'].filter(Boolean).join(' · ') || '무료'
  }
  if (a.kind==='power-offer' && a.accept) {
    const [first,second] = s.resources.bowls
    const gain = Math.min(first*2+second,s.pending[0].amount,s.points.player+1)
    return `파워 +${gain} · 승점 −${Math.max(0,gain-1)}`
  }
  if (a.kind==='innovation') {
    const c = innovationCost(s,a.id)
    return [...Object.entries(c.books).filter(([,n])=>n).map(([k,n])=>labels[k]+' '+n),
      `자유 책 ${c.anyBooks}`,`코인 ${c.coins}`,`현재 ${innovationPoints(s,a.id)}점`].join(' · ')
  }
  if (a.kind==='competency') {
    const loc = competencyLocation(s,a.id)
    return `${labels[loc.discipline]} ${loc.levels}칸 · 해당 책 ${loc.books}권`
  }
  if (a.kind==='track') return a.track==='sailing' ? '코인 4 · 학자 1' : `코인 ${s.playerTerrain==='plains'?1:5} · 도구 1 · 학자 1`
  if (a.kind==='mole-bridge') return '도구 1'
  if (a.kind==='pass' && a.id) return `누적 코인 +${s.bonusTiles.pool.find(t=>t.id===a.id).coins}`
  if (a.from) return a.from+' ↔ '+a.to
  return ''
}

export function choiceRows(s,category,hex) {
  return suggestions(s,category,hex).map(action=>{
    let info = ''
    try {
      info = actionInfo(s,action)
      play(s,action)
      return {action,label:actionDescription(action,s),info,enabled:true}
    } catch (error) {
      const reason=boardMessages[error.message] ?? error.message
      return {action,label:actionDescription(action,s),info:[info,reason].filter(Boolean).join(' · '),enabled:false}
    }
  })
}

function actionHexes(action) {
  return [action.hex,action.from,action.to].filter(Boolean)
}

export function boardTargets(s,category='보드') {
  if (s.bookChoices || s.phase==='finished') return []
  const p = s.pending[0]
  if (p?.kind==='tile-choice') return [...new Set(tileChoices(s,p).flatMap(actionHexes))]
  if (p?.kind==='tower') return neutralSites(s)
  if (p && p.kind!=='spades') return []
  if (!p && s.actor!=='player') return []
  if (!p && s.actionTaken) return riverCityActions(s).map(a=>a.hex)
  if (!p && category==='파워·특수') {
    return [...new Set(choiceRows(s,category,null).filter(r=>r.enabled).flatMap(r=>actionHexes(r.action)))]
  }
  if (!p && category!=='보드') return []
  const own=s.buildings.filter(b=>b.owner==='player')
  const candidates=new Set([...openBuildHexes(s,own,effectiveSailing(s)),...own.map(b=>b.hex)])
  if (s.phase==='actions' && (s.palace===9 || s.playerFaction==='moles')) {
    for (const hex of dry) if (canTravel(s,hex,'flight') || canTravel(s,hex,'tunnel')) candidates.add(hex)
  }
  const legal=[...candidates].filter(hex=>suggestions(s,'보드',hex).some(action=>{
    if (action.hex!==hex) return false
    try { play(s,action); return true } catch { return false }
  }))
  return p ? legal : [...legal,...riverCityActions(s).map(a=>a.hex)]
}
