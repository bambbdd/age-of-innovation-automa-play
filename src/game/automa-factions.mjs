import { smallBoard, nativeTerrains } from './small-board.mjs'
import { automaDistances, openBuildHexes, spadesBetween, terrainAt } from './board-rules.mjs'
import { directionalSelection } from './automa-board.mjs'
import { shuffleWithSeed } from './setup.mjs'
import priorities from './data/terrain-priorities.json' with {type:'json'}

export const botDescriptions = {
  simpletons:'종족 카드로 작업장을 건설한 뒤 난이도 점수를 받습니다.',
  kuddlers:'종족 건설은 내 건물에 가까운 칸, 내 지형 우선순위 순으로 정합니다. 난이도 점수에 1점을 더 받습니다.',
  mimics:'종족 건설에 내 지형 우선순위를 사용합니다. 난이도 점수에 1점을 더 받습니다.',
  wanderers:'종족 건설은 거리 제한을 무시하고 난이도 점수에서 1점을 뺍니다(최소 0점). 최종 정산 때 자기 건물당 2점을 받습니다.',
  druids:'종족 건설 뒤 따라잡기 규칙으로 한 과학 분야에서 2칸 전진합니다.',
  racelings:'오토마가 먼저 패스하면 그 라운드의 패스 점수를 두 번 받습니다.',
  powermongers:'종족 건설은 나에게 가장 많은 파워를 제안하는 칸을 먼저 고릅니다. 건물에서 파워를 2 이상 받으면 오토마가 과학 1칸을 전진합니다.',
  symbionts:'종족 건설 뒤 내 건물에 인접한 빈 육지에 도구를 놓습니다. 도구가 있는 칸은 건설하거나 변환할 수 없습니다.',
  blight:'종족 건설 뒤 휴경지 두 칸을 황폐지로 바꾸고 난이도 점수에 1점을 더 받습니다.',
  gognomes:'대국마다 업적 세 개를 뽑습니다. 달성할 때마다 순서대로 8점, 16점, 24점을 받습니다.',
}

export const achievementNames = {
  1:'건설·개량으로 파워 3 이상 제안', 2:'과학 세 분야 이상 단독 선두', 3:'먼저 패스 3회',
  4:'보너스 타일의 코인 7개 수집', 5:'라운드 종료 시 10점 이상 앞서기', 6:'나중에 패스 3회',
}

export function factionSetup(state) {
  const {playerTerrain,automaTerrain,automaFaction,deal}=state
  if (automaFaction==='gognomes') return {goals:shuffleWithSeed([1,2,3,4,5,6],deal.seed^0x6a37).slice(0,3),
    completed:[],early:0,late:0,coins:0}
  if (automaFaction==='symbionts') {
    const candidates=nativeTerrains.filter(t=>t!==automaTerrain && spadesBetween(t,playerTerrain)===2)
    return {youth:shuffleWithSeed(candidates,deal.seed^0x53a1)[0],tools:[]}
  }
  if (automaFaction==='blight') {
    const farNeighbor=(base,other)=>nativeTerrains.filter(t=>spadesBetween(t,base)===1)
      .sort((a,b)=>spadesBetween(b,other)-spadesBetween(a,other))[0]
    return {fallow:farNeighbor(playerTerrain,automaTerrain),blighted:farNeighbor(automaTerrain,playerTerrain)}
  }
  return {}
}

function selectBest(hexes,rank,support) {
  const best=Math.min(...hexes.map(rank))
  return directionalSelection(hexes.filter(hex=>rank(hex)===best),support)
}

export function placeTool(state,support) {
  const players=state.buildings.filter(b=>b.owner==='player')
  const options=openBuildHexes(state,players,0)
  if (!options.length) return {state,summary:'공생체족 도구 배치 생략'}
  const order=priorities[support.terrainPriority][state.botSpecial.youth]
  const hex=selectBest(options,hex=>order.indexOf(terrainAt(state,hex)),support)
  const tools=[...state.botSpecial.tools,hex]
  return {state:{...state,botSpecial:{...state.botSpecial,tools}},summary:hex+'에 공생체족 도구 배치'}
}

export function spreadBlight(state,support) {
  const {fallow,blighted}=state.botSpecial
  const occupied=new Set(state.buildings.map(b=>b.hex))
  let options=smallBoard.filter(c=>!occupied.has(c.id) && terrainAt(state,c.id)===fallow).map(c=>c.id)
  const distances=automaDistances(state,state.buildings.filter(b=>b.owner==='player').map(b=>b.hex))
  const terrainChanges={...state.terrainChanges}
  const changed=[]
  while (changed.length<2 && options.length) {
    const hex=selectBest(options,id=>distances.get(id)??Infinity,support)
    terrainChanges[hex]=blighted
    changed.push(hex)
    options=options.filter(id=>id!==hex)
  }
  return {state:{...state,terrainChanges},summary:changed.length?'황폐지 전환 · '+changed.join('·'):'휴경지 없음'}
}

export function checkAchievements(state,{power=0,end=false,pass=null}={}) {
  if (state.automaFaction!=='gognomes') return state
  const progress={...state.botSpecial,completed:[...state.botSpecial.completed]}
  if (pass) {
    progress[pass.first?'early':'late']++
    progress.coins+=pass.coins
  }
  const leads=Object.keys(state.automaScience).filter(k=>state.automaScience[k]>state.playerScience[k]).length
  const conditions=[false,power>=3,leads>=3,progress.early>=3,progress.coins>=7,
    end && state.points.automa-state.points.player>=10,progress.late>=3]
  let points=state.points.automa
  const log=[...(state.log??[])]
  for (const id of progress.goals) {
    if (!conditions[id] || progress.completed.includes(id)) continue
    progress.completed.push(id)
    const award=8*progress.completed.length
    points+=award
    log.push({round:state.round,text:'고그놈족 업적 · '+achievementNames[id]+' (+'+award+'점)'})
  }
  return {...state,botSpecial:progress,log,points:{...state.points,automa:points}}
}
