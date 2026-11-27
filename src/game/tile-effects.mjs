import { smallBoard, bridgeSites } from './small-board.mjs'
import { adjacentLand, builtBridges, newCityGroups, openBuildHexes, pieceAvailable,
  terrainAt, upgradePlayerBuilding } from './board-rules.mjs'
import { advanceTrack, effectiveSailing } from './player-economy.mjs'

const disciplines = ['banking','law','engineering','medicine']
const neutral = {11:'workshop',12:'school',13:'university',14:'palace',15:'monument',18:'guild'}
const powers = {1:'도구 2개',2:'삽 2개',3:'양성소를 교역소로 교체',4:'작업장을 교역소로 개량',
  6:'한 분야에서 최대 2칸 전진',13:'책 1권과 코인 3개'}
const innovationActions = {2:'무료 삽 1개',3:'학자 1명과 3점'}
const check = (ok,message) => { if (!ok) throw new Error(message) }
const choice = (s,effect,params={}) => s.pending.push({kind:'tile-choice',effect,...params})
const playerPieces = s => s.buildings.filter(b=>b.owner==='player')
const clear = (s,hex) => !s.buildings.some(b=>b.hex===hex) && !s.botSpecial?.tools?.includes(hex)

function freeTrack(s,track,ctx) {
  const before=s[track]
  advanceTrack(s,track,{free:true})
  if (s[track]!==before) ctx.score(s,'sailing-or-terraforming-advance')
}

export function innovationEffect(s,id,ctx) {
  if (id===2) ctx.reward(s,{books:1,eachScience:1})
  if (id===4) {
    const shapes=new Set(playerPieces(s).map(b=>b.building))
    ctx.reward(s,{scienceChoice:shapes.size})
  }
  if (id===8) {
    ctx.reward(s,{scholars:1})
    freeTrack(s,'terraforming',ctx)
    freeTrack(s,'sailing',ctx)
  }
  if (neutral[id]) {
    choice(s,'neutral',{building:neutral[id]})
    if (id===12) s.pending.push({kind:'competency'})
    if (id===14) s.resources.bowls[2]+=2
  }
}

export function palaceEffect(s,id,ctx) {
  if (id===5) s.pending.push({kind:'competency'})
  if (id===8) ctx.cities(s)
  if (id===11) ctx.grantCity(s,'궁전')
  if (id===14) {
    freeTrack(s,'sailing',ctx)
    freeTrack(s,'sailing',ctx)
  }
  if (id===15) s.pending.unshift({kind:'tile-choice',effect:'engineering',remaining:['spades','bridges','books']})
  if (id===16) choice(s,'native-guild')
}

export function bookEffect(s,id) {
  if (id===2) choice(s,'discipline',{levels:2})
  if (id===4) choice(s,'upgrade-guild')
}

function eligibleGuilds(s,from) {
  if (!pieceAvailable(s,'player','guild')) return []
  return playerPieces(s).filter(b=>b.building===from&&!b.neutral).map(b=>b.hex)
}

export function canUseBook(s,id) {
  return id!==4 || eligibleGuilds(s,'workshop').length>0
}

function emptyNative(s) {
  if (!pieceAvailable(s,'player','guild')) return []
  return smallBoard.filter(c=>terrainAt(s,c.id)===s.playerTerrain && clear(s,c.id)).map(c=>c.id)
}

export function neutralSites(s) {
  return openBuildHexes(s,playerPieces(s),effectiveSailing(s)).filter(hex=>terrainAt(s,hex)===s.playerTerrain)
}

function freeBridges(s) {
  const current=builtBridges(s)
  if (current.length>=3) return []
  const hasPiece=hex=>playerPieces(s).some(b=>b.hex===hex)
  return bridgeSites.filter(([a,b])=>(hasPiece(a)||hasPiece(b)) &&
    !current.some(([x,y])=>(x===a && y===b)||(x===b && y===a)))
}

// The chosen river can join groups for this city alone. It never grants a bridge or sailing reach.
export function riverCityGroup(s,river) {
  if (s.palace!==14 || (s.riverCities??[]).includes(river) || terrainAt(s,river)!=='river') return null
  const banks=playerPieces(s).filter(b=>adjacentLand(s,river).has(b.hex)).map(b=>b.hex)
  if (banks.length<2) return null
  const joins=banks.slice(1).map(bank=>[banks[0],bank])
  const trial={...s,builtBridges:[...builtBridges(s),...joins]}
  const group=newCityGroups(trial).find(group=>banks.every(hex=>group.includes(hex)))
  if (!group || newCityGroups(s).some(existing=>banks.every(hex=>existing.includes(hex)))) return null
  return group
}

function useGuild(s,hex,from,ctx) {
  check(eligibleGuilds(s,from).includes(hex),'교역소로 교체할 수 없는 건물입니다.')
  if (from==='school') {
    s.buildings=s.buildings.map(b=>b.hex===hex?{...b,building:'guild'}:b)
    ctx.reward(s,{points:3,tools:1})
  } else Object.assign(s,upgradePlayerBuilding(s,hex,'guild'))
  ctx.buildingScore(s,hex,'guild')
}

export function tileChoices(s,p) {
  const make=(extra={})=>({kind:'tile-choice',effect:p.effect,...extra})
  switch (p.effect) {
    case 'neutral':
    case 'native-guild':
    case 'upgrade-guild': {
      const hexes=p.effect==='neutral'?neutralSites(s):p.effect==='native-guild'?emptyNative(s):eligibleGuilds(s,'workshop')
      return hexes.length ? hexes.map(hex=>make({hex,building:p.building??'guild'})) : [make({skip:true})]
    }
    case 'discipline': return disciplines.map(discipline=>make({discipline}))
    case 'engineering': return p.remaining.map(bonus=>make({bonus}))
    case 'bridges': {
      const spans=freeBridges(s)
      return spans.length ? spans.map(([from,to])=>make({from,to})) : [make({skip:true})]
    }
    default: return []
  }
}

export function resolveTileChoice(s,p,a,ctx) {
  check(a.kind==='tile-choice' && a.effect===p.effect,'먼저 타일 효과를 선택하세요.')
  switch (p.effect) {
    case 'discipline':
      ctx.advance(s,a.discipline,p.levels)
      break
    case 'neutral':
    case 'native-guild':
    case 'upgrade-guild': {
      const options=tileChoices(s,p)
      check(options.some(o=>a.skip?o.skip:!o.skip&&o.hex===a.hex),'사용 가능한 칸을 선택하세요.')
      if (a.skip) break
      if (p.effect==='upgrade-guild') {useGuild(s,a.hex,'workshop',ctx); break}
      const isNeutral=p.effect==='neutral'
      const building=isNeutral?p.building:'guild'
      s.buildings.push({hex:a.hex,building,owner:'player',...(isNeutral?{neutral:true}:{})})
      ctx.buildingScore(s,a.hex,building,{neutral:isNeutral})
      break
    }
    case 'engineering': {
      check(p.remaining.includes(a.bonus),'이미 받은 궁전 보상입니다.')
      const remaining=p.remaining.filter(id=>id!==a.bonus)
      if (a.bonus==='bridges') s.pending.unshift({kind:'tile-choice',effect:'bridges',left:2})
      if (a.bonus==='books') s.bookChoices+=2
      if (a.bonus==='spades') s.pending.unshift({kind:'spades',left:2})
      // Complete each reward before starting the next. City rewards produced during the bundle wait.
      if (remaining.length) {
        const index=['bridges','spades'].includes(a.bonus)?1:0
        s.pending.splice(index,0,{...p,remaining})
      }
      break
    }
    case 'bridges': {
      const options=tileChoices(s,p)
      check(options.some(o=>a.skip?o.skip:o.from===a.from&&o.to===a.to),'사용 가능한 다리터를 고르세요.')
      if (a.skip) break
      ctx.bridge(s,a.from,a.to)
      if (p.left>1) s.pending.unshift({...p,left:p.left-1})
      break
    }
    default: throw new Error('알 수 없는 타일 효과입니다.')
  }
}

const riverHexes=smallBoard.filter(c=>c.terrain==='river').map(c=>c.id)
export function riverCityActions(s) {
  if (s.palace!==14) return []
  return riverHexes.filter(hex=>riverCityGroup(s,hex)).map(hex=>({kind:'river-city',hex}))
}

export function foundRiverCity(s,hex,ctx) {
  const group=riverCityGroup(s,hex)
  check(group,'이 강 칸을 건너 도시를 세울 수 없습니다.')
  s.riverCities=[...(s.riverCities??[]),hex]
  s.buildings=s.buildings.map(b=>group.includes(b.hex)?{...b,cityId:hex}:b)
  ctx.grantCity(s,hex)
}

export function tileSpecials(s) {
  const actions=[]
  for (const id of s.innovations.player) {
    if (innovationActions[id]) actions.push({kind:'tile-action',source:'innovation',id})
  }
  const id=s.palace
  const palaceAction={kind:'tile-action',source:'palace',id}
  if (id===3 || id===4) {
    actions.push(...eligibleGuilds(s,id===3?'school':'workshop').map(hex=>({...palaceAction,hex})))
  } else if (id===6) {
    for (const discipline of disciplines) for (const levels of [1,2]) actions.push({...palaceAction,discipline,levels})
  } else if (powers[id]) actions.push(palaceAction)
  return actions
}

export function useTileSpecial(s,a,ctx) {
  const key=a.source+'-'+a.id
  check(!s.blocked.special.includes(key),'이번 라운드에 이미 사용한 타일입니다.')
  if (a.source==='innovation') {
    check(s.innovations.player.includes(a.id) && innovationActions[a.id],'보유한 혁신의 특수 행동을 선택하세요.')
    if (a.id===2) ctx.reward(s,{spades:1})
    if (a.id===3) ctx.reward(s,{scholars:1,points:3})
  } else {
    check(a.source==='palace' && s.palace===a.id && powers[a.id],'보유한 궁전의 특수 행동을 선택하세요.')
    switch (a.id) {
      case 1: ctx.reward(s,{tools:2}); break
      case 2: ctx.reward(s,{spades:2}); break
      case 3: case 4: useGuild(s,a.hex,a.id===3?'school':'workshop',ctx); break
      case 6:
        check([1,2].includes(a.levels),'한 분야에서 1~2칸을 전진하세요.')
        ctx.advance(s,a.discipline,a.levels)
        break
      case 13: ctx.reward(s,{books:1,coins:3}); break
    }
  }
  s.blocked.special.push(key)
}

export function tileLabel(a,labels) {
  if (a.kind==='river-city') return a.hex+' 강을 건너 도시 설립'
  if (a.kind==='tile-action') {
    const detail=a.discipline?labels[a.discipline]+' '+a.levels+'칸':a.hex
    return [a.source==='innovation'?innovationActions[a.id]:powers[a.id],detail].filter(Boolean).join(' · ')
  }
  if (a.skip) return '배치할 자리가 없어 효과 마치기'
  if (a.discipline) return labels[a.discipline]+' 2칸 전진'
  if (a.bonus) return {bridges:'다리 2개 건설',books:'책 2권 획득',spades:'삽 2개로 지형 변환·건설'}[a.bonus]
  if (a.from) return a.from+' ↔ '+a.to+' 다리 건설'
  return a.hex+' · '+(a.effect==='neutral'?'중립 ':'')+(labels[a.building]??'교역소')
}
