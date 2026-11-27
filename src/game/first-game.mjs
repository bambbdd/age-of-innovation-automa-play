import { createSetupDeal, placeStartingBuildings } from './setup.mjs'
import { roundTiles, finalTiles, roundScoring } from './score-tiles.mjs'
import { areaScoring, foundCities, terrainAt, terraformAndBuild, upgradePlayerBuilding,
  placeBridge, openBuildHexes } from './board-rules.mjs'
import { smallBoard } from './small-board.mjs'
import { startBot, botTurn, prepareNextBotRound, applyBotPowerGain, botEndgamePoints, checkBotRoundEnd } from './automa-turn.mjs'
import * as economy from './player-economy.mjs'
import * as tiles from './first-game-tiles.mjs'
import * as effects from './tile-effects.mjs'
import { factionCityReward, powerActionCost } from './player-factions.mjs'

export const subjects = ['banking', 'law', 'engineering', 'medicine']
const powers = [0, 3, 3, 4, 4, 4, 6]
const border = new Set(smallBoard.filter(c => smallBoard.filter(t =>
  Math.max(Math.abs(c.q-t.q), Math.abs(c.r-t.r), Math.abs(c.q+c.r-t.q-t.r)) === 1).length < 6).map(c => c.id))

function check(condition, message) { if (!condition) throw new Error(message) }
const owned = (s, type) => s.buildings.filter(b => b.owner === 'player' && b.building === type).length
const addLog = (s, text) => s.log.push({ round: s.round, text })

export function firstDeal() {
  const deal = createSetupDeal({ seed: 42 })
  return { ...deal, innovations: [...tiles.starterInnovations], palaces: [...tiles.starterPalaces],
    bookActions: [...tiles.starterBookActions] }
}

export function createFirstGame({ hexes = ['A2','A8'], bonus = 3 } = {}) {
  return createGame(firstDeal(), {
    playerTerrain: 'mountain', playerFaction: 'navigators', automaTerrain: 'desert',
    automaFaction: 'simpletons', playerBonus: bonus,
    playerBuildings: hexes.map(hex => ({ hex, building: 'workshop' })),
  })
}

export function createGame(deal, selection) {
  const position = placeStartingBuildings(deal, selection)
  const s = startBot({ ...position, round: 1, actor: 'player', passed: [], pending: [], log: [],
    competencies: [], cityTiles: [], palace: null, annexes: 0,
    scholarSlots: Object.fromEntries(subjects.map(k => [k, Array(4).fill(null)])),
    innovations: { pool: [...position.deal.innovations], player: [], automa: [] } })
  economy.initializeEconomy(s)
  s.phase = 'setup'
  settle(s)
  return s
}

function score(s, action, count = 1) {
  if (s.phase !== 'actions') return
  for (const trigger of s.scoring.triggers) if (trigger.action === action) s.points.player += count * trigger.points
}

function advance(s, discipline, n) {
  check(subjects.includes(discipline), '과학 분야를 선택하세요.')
  const before = s.playerScience[discipline]
  const steps = economy.advanceScience(s, discipline, n, {useKey:false})
  if (before < 8 && before+n >= 8 && s.keys > 0) {
    s.pending.unshift({kind:'key',discipline,left:n-steps})
  }
  score(s, 'science-advance', steps)
  return steps
}

function reward(s, r = {}) {
  s.points.player += r.points ?? 0
  s.resources.coins += r.coins ?? 0
  s.resources.tools += r.tools ?? 0
  if (r.power) economy.chargePower(s, r.power)
  if (r.scholars) economy.gainScholars(s, r.scholars)
  if (r.books) s.bookChoices += r.books
  if (r.pointsPerGuild) s.points.player += owned(s,'guild') * r.pointsPerGuild
  if (r.eachScience) for (const k of subjects) advance(s,k,r.eachScience)
  if (r.scienceChoice) s.pending.push({ kind:'science', left:r.scienceChoice })
  if (r.spades) s.pending.push({ kind:'spades', left:r.spades })
}

function newRound(s) {
  s.phase = 'income'
  s.actor = s.turnOrder[0]
  s.actionTaken = false
  s.passed = []
  s.blocked = { power: [], book: [], special: [] }
  const { rounds, final } = s.deal.scoreTiles
  s.scoring = roundScoring(s.round, roundTiles.find(t => t.id === rounds[s.round-1]), finalTiles.find(t => t.id === final))
  reward(s, tiles.tileIncome(s))
  addLog(s, `제${s.round}라운드 시작`)
}

function finish(s) {
  const area = areaScoring(s,s.sailing,{flight:s.palace===9})
  const totals = { player: 0, automa: 0 }
  const science = {}
  for (const k of subjects) {
    const a = s.playerScience[k], b = s.automaScience[k]
    science[k] = { player: a === 0 ? 0 : a === b ? 6 : a > b ? 8 : 4,
      automa: b === 0 ? 0 : a === b ? 6 : b > a ? 8 : 4 }
    for (const who of ['player','automa']) totals[who] += science[k][who]
  }
  const resources = economy.remainingResourcePoints(s)
  const factionPoints = botEndgamePoints(s)
  s.final = { before: { ...s.points }, area, science, resources, automaFaction: factionPoints }
  s.points.player += totals.player + area.points.player + resources
  s.points.automa += totals.automa + area.points.automa + factionPoints
  s.phase = 'finished'
  addLog(s,'최종 영역·과학·잔여 자원 정산')
}

function scienceBonus(s) {
  const b = s.scoring.scienceBonus
  const levels = s.playerScience[s.scoring.discipline] + (s.playerFaction === 'blessed' ? 3 : 0)
  const n = Math.floor(levels / b.levels) * b.amount
  const keys = { coin:'coins', tool:'tools', scholar:'scholars', 'book-of-choice':'books', power:'power', spade:'spades' }
  reward(s,{ [keys[b.reward]]:n })
  addLog(s,`라운드 종료 · 과학 보너스 ×${n}`)
}

// Completion of a turn/round waits until every reward and power decision has been resolved.
function settle(s) {
  while (!s.bookChoices && s.phase !== 'finished') {
    if (s.pending[0]?.kind === 'faction-book') {
      s.pending.shift()
      s.bookChoices++
    } else if (s.pending.length) break
    else if (s.phase === 'setup') {
      newRound(s)
    } else if (s.phase === 'income') {
      economy.collectIncome(s)
      s.phase = 'actions'
      addLog(s,'수입 수령')
    } else if (s.phase === 'intermission') {
      Object.assign(s,checkBotRoundEnd(s))
      for (const tile of s.bonusTiles.pool) tile.coins++
      Object.assign(s,prepareNextBotRound(s))
      s.turnOrder = [...s.passed]
      s.round++
      newRound(s)
    } else if (s.passed.length === 2) {
      if (s.round === 6) { Object.assign(s,checkBotRoundEnd(s)); finish(s) }
      else { s.phase = 'intermission'; scienceBonus(s) }
    } else break
  }
}

function endTurn(s, who) {
  const other = who === 'player' ? 'automa' : 'player'
  s.actor = s.passed.includes(other) ? who : other
  s.actionTaken = false
}

function cities(s) {
  const result = foundCities(s,s.palace===8?6:7)
  Object.assign(s,result.position)
  for (const group of result.cities) grantCity(s,group.join('·'))
}

function grantCity(s, location) {
  s.keys++
  score(s,'city')
  s.pending.push({kind:'city'})
  factionCityReward(s)
  addLog(s,`${location} 도시 설립`)
}

const tileContext = { reward, advance, score, grantCity, buildingScore, transform, bridge, cities }

function buildingScore(s, hex, type, {neutral=false}={}) {
  score(s, type === 'university' || type === 'palace' ? 'palace-or-university' : type)
  if (type === 'workshop') {
    s.points.player += economy.navigatorsRiverPoints(s,hex)
    if (border.has(hex)) {
      score(s,'workshop-on-border')
      if (s.competencies.some(id => tiles.competencyRewards[id].trigger === 'workshop-on-border')) s.points.player += 3
    }
  }
  if (type === 'guild' && s.bonusTiles.player === 9) s.points.player += 3
  if (type === 'guild' && s.palace === 13) s.points.player += 3
  if (type === 'workshop' && s.palace === 12) s.points.player += 2
  if (!neutral && (type === 'school' || type === 'university')) s.pending.push({kind:'competency'})
  if (!neutral && type === 'palace') s.pending.push({kind:'palace'})
  cities(s)
}

function transform(s, a, free = 0, freeWorkshop = false, prepaidTravel = false) {
  check(typeof a.build === 'boolean', '작업장 건설 여부를 선택하세요.')
  const result = terraformAndBuild(s, a.hex, economy.effectiveSailing(s), a)
  if (a.travel && !prepaidTravel) {
    economy.pay(s,a.travel === 'tunnel' ? {tools:1} : {scholars:1})
    s.points.player += a.travel === 'tunnel' ? 4 : 5
  }
  economy.pay(s,economy.buildingCost(s,a.hex,null,Math.max(0,result.spades-free)))
  if (s.playerFaction === 'goblins') s.resources.coins += 2 * result.spades
  if (a.build && !freeWorkshop) economy.pay(s,economy.buildingCost(s,a.hex,'workshop'))
  // Only copy board fields, preserving the newly debited resource state.
  s.buildings = result.position.buildings
  s.terrainChanges = result.position.terrainChanges
  score(s,'spade-spent',result.spades)
  if (a.build) buildingScore(s,a.hex,'workshop')
  return result.spades
}

function useSpades(s, p, a) {
  const noBuild = s.phase === 'intermission' || s.phase === 'setup'
  check(!a.travel || !noBuild,'이 단계에는 굴 파기와 비행을 사용할 수 없습니다.')
  if (a.kind === 'skip') return
  if (a.kind === 'finish-build') {
    check(!noBuild && (p.freeWorkshop || !p.first || p.first === a.hex) && terrainAt(s,a.hex) === s.playerTerrain,
      '첫 고향 지형에서만 건설할 수 있습니다.')
    const paid = Boolean(p.firstTravel && p.first === a.hex)
    transform(s,{hex:a.hex, build:true, travel: paid ? p.firstTravel : a.travel},0,p.freeWorkshop,paid)
    return
  }
  check(a.kind === 'terraform' && p.left > 0 && (!p.used?.includes(a.hex)), '다른 칸을 선택하세요.')
  const target = a.terrain ?? s.playerTerrain
  const trial = terraformAndBuild(s,a.hex,economy.effectiveSailing(s),{terrain:target,build:false,travel:a.travel})
  check(trial.spades <= p.left || (!noBuild && !p.first && target === s.playerTerrain),'이번 효과의 삽 수를 초과합니다.')
  check(!p.first || p.allowExtra || noBuild,'첫 칸을 고향 지형으로 바꾸세요.')
  transform(s,{hex:a.hex,terrain:target,build:false,travel:a.travel},p.left)
  const left = Math.max(0,p.left-trial.spades)
  const first = p.first ?? a.hex
  const canBuild = !noBuild && (p.freeWorkshop || terrainAt(s,first) === s.playerTerrain)
  if ((left && (noBuild || target === s.playerTerrain)) || canBuild) {
    s.pending.unshift({...p,left,first,firstTravel:p.first ? p.firstTravel : a.travel,
      allowExtra:target === s.playerTerrain,used:[...(p.used ?? []),a.hex]})
  }
}

function bridge(s, from, to, options) {
  check((s.builtBridges ?? []).length < 3, '다리를 모두 사용했습니다.')
  Object.assign(s,placeBridge(s,'player',from,to,options))
  cities(s)
}

function selectCompetency(s,id) {
  check(s.deal.competencies.includes(id) && !s.competencies.includes(id),'선택할 수 없는 적성 타일입니다.')
  const r = tiles.competencyRewards[id]
  const loc = tiles.competencyLocation(s,id)
  s.competencies.push(id)
  advance(s,loc.discipline,loc.levels)
  s.resources.books[loc.discipline] += loc.books + Number(s.playerFaction === 'philosophers')
  reward(s,r.immediate)
  if (r.immediate?.annexes) s.annexes += r.immediate.annexes
  if (r.immediate?.tower) s.pending.push({kind:'tower'})
}

function resolvePurchase(s,p) {
  if (p.market === 'innovation') {
    const pts = tiles.innovationPoints(s,p.id)
    s.innovations.pool = s.innovations.pool.filter(id => id !== p.id)
    s.innovations.player.push(p.id)
    s.points.player += pts
    score(s,'innovation')
    effects.innovationEffect(s,p.id,tileContext)
  } else {
    s.blocked.book.push(p.id)
    reward(s,tiles.bookActions[p.id].reward)
    effects.bookEffect(s,p.id)
  }
}

function buy(s,market,id) {
  let cost
  if (market === 'innovation') {
    check(s.innovations.player.length < 3 && s.innovations.pool.includes(id),'개발할 수 없는 혁신입니다.')
    cost = tiles.innovationCost(s,id)
  } else {
    check(s.deal.bookActions.includes(id) && !s.blocked.book.includes(id),'이미 사용한 책 행동입니다.')
    cost = tiles.bookActions[id]
    check(effects.canUseBook(s,id),'이 책 행동을 실행할 수 없습니다.')
  }
  economy.pay(s,{coins:cost.coins ?? 0,books:cost.books ?? {}})
  check(Object.values(s.resources.books).reduce((a,b)=>a+b,0) >= cost.anyBooks,'책이 부족합니다.')
  const p = {kind:'pay-book',market,id,left:cost.anyBooks}
  if (p.left) s.pending.push(p)
  else resolvePurchase(s,p)
}

function resolveChoice(s,a) {
  const p = s.pending.shift()
  if (p.kind === 'tile-choice') return effects.resolveTileChoice(s,p,a,tileContext)
  if (p.kind === 'spades') return useSpades(s,p,a)
  check(a.kind === p.kind,'먼저 표시된 선택을 완료하세요.')
  switch (p.kind) {
    case 'power-offer': {
      const received = economy.offerPower(s,p.amount,a.accept === true)
      Object.assign(s,applyBotPowerGain(s,received))
      break
    }
    case 'pay-book':
      check(subjects.includes(a.discipline),'분야를 선택하세요.')
      economy.pay(s,{books:{[a.discipline]:1}})
      if (--p.left) s.pending.unshift(p)
      else resolvePurchase(s,p)
      break
    case 'science':
      if (--p.left) s.pending.unshift(p)
      advance(s,a.discipline,1)
      break
    case 'palace':
      check(s.deal.palaces.includes(a.id),'궁전 타일을 선택하세요.')
      s.palace = a.id
      reward(s,tiles.palaceRewards[a.id].immediate)
      effects.palaceEffect(s,a.id,tileContext)
      break
    case 'competency': selectCompetency(s,a.id); break
    case 'city': {
      const r = tiles.cityRewards[a.id]
      check(r && s.cityTiles.filter(id=>id===a.id).length < 3,'도시 타일이 부족합니다.')
      s.cityTiles.push(a.id)
      reward(s,r.reward ?? r)
      break
    }
    case 'tower': {
      const reach = openBuildHexes(s,s.buildings.filter(b=>b.owner==='player'),economy.effectiveSailing(s))
      if (a.skip) {
        const possible = reach.some(hex => {
          if (terrainAt(s,hex) === s.playerTerrain) return true
          const {spades} = terraformAndBuild(s,hex,economy.effectiveSailing(s),{build:false})
          return economy.buildingCost(s,hex,null,spades).tools <= s.resources.tools
        })
        check(!possible,'배치할 수 있는 칸에 탑을 놓으세요.')
        break
      }
      check(reach.includes(a.hex),'도달할 수 있는 빈 땅에 놓으세요.')
      if (terrainAt(s,a.hex) !== s.playerTerrain) transform(s,{hex:a.hex,build:false})
      s.buildings.push({hex:a.hex,owner:'player',building:'tower',neutral:true})
      cities(s)
      break
    }
    case 'bridge': bridge(s,a.from,a.to); break
    case 'key':
      if (a.accept && s.keys) score(s,'science-advance',economy.advanceScience(s,p.discipline,p.left))
      break
    default: throw new Error('알 수 없는 선택입니다.')
  }
}

function regularAction(s,a) {
  switch (a.kind) {
    case 'tile-action': effects.useTileSpecial(s,a,tileContext); break
    case 'mole-bridge':
      economy.pay(s,{tools:1})
      bridge(s,a.from,a.to,{moleAction:true})
      break
    case 'terraform': transform(s,a); break
    case 'upgrade':
      economy.pay(s,economy.buildingCost(s,a.hex,a.building))
      Object.assign(s,upgradePlayerBuilding(s,a.hex,a.building))
      buildingScore(s,a.hex,a.building)
      break
    case 'track':
      economy.advanceTrack(s,a.track)
      score(s,'sailing-or-terraforming-advance')
      break
    case 'scholar': {
      check(subjects.includes(a.discipline),'분야를 선택하세요.')
      const slots = s.scholarSlots[a.discipline]
      check(a.slot === -1 || Number.isInteger(a.slot) && slots[a.slot] === null,'이미 학자가 있는 자리입니다.')
      economy.pay(s,{scholars:1})
      if (a.slot !== -1) slots[a.slot] = 'player'
      advance(s,a.discipline,a.slot === -1 ? 1 : a.slot === 0 ? 3 : 2)
      if (s.bonusTiles.player === 2) s.points.player += 2
      if (s.competencies.some(id=>tiles.competencyRewards[id].trigger === 'send-scholar')) s.points.player += 2
      break
    }
    case 'innovation': buy(s,'innovation',a.id); break
    case 'book': buy(s,'book',a.id); break
    case 'power': {
      check(Number.isInteger(a.id) && a.id > 0 && a.id < powers.length && !s.blocked.power.includes(a.id),'파워 행동을 사용할 수 없습니다.')
      economy.pay(s,{power:powerActionCost(s,powers[a.id])})
      if (s.playerFaction === 'illusionists') s.points.player += 3
      s.blocked.power.push(a.id)
      if (a.id === 1) bridge(s,a.from,a.to)
      if (a.id === 2) economy.gainScholars(s,1)
      if (a.id === 3) s.resources.tools += 2
      if (a.id === 4) s.resources.coins += 7
      if (a.id >= 5) s.pending.push({kind:'spades',left:a.id-4})
      break
    }
    case 'special': {
      const bonus = s.bonusTiles.player
      check(!s.blocked.special.includes(a.source),'이미 사용한 특수 행동입니다.')
      if (a.source === 'philosophers' && s.playerFaction === a.source) s.bookChoices++
      else if (a.source === 'psychics' && s.playerFaction === a.source) {
        economy.chargePower(s,5)
        s.blocked.special.push(a.source)
        return 'extra-action'
      }
      else if (a.source === 'bonus' && bonus === 3) s.pending.push({kind:'spades',left:1})
      else if (a.source === 'bonus' && bonus === 6) advance(s,a.discipline,1)
      else if (a.source === 'bonus' && bonus === 4) bridge(s,a.from,a.to)
      else if (a.source === 'competency' && s.competencies.some(id=>tiles.competencyRewards[id].special?.power)) economy.chargePower(s,4)
      else throw new Error('사용할 특수 행동이 없습니다.')
      s.blocked.special.push(a.source)
      break
    }
    case 'annex': {
      const b = s.buildings.find(b => b.owner === 'player' && b.hex === a.hex)
      check(s.annexes > 0 && b && !b.annex,'별관을 놓을 수 없습니다.')
      b.annex = true
      s.annexes--
      cities(s)
      break
    }
    default: throw new Error('알 수 없는 행동입니다.')
  }
}

function pass(s,id) {
  s.points.player += economy.bonusPassPoints(s) + tiles.tilePassPoints(s)
  if (s.bonusTiles.player === 10 && owned(s,'school')) s.pending.push({ kind:'science',left:owned(s,'school') })
  if (s.round < 6) {
    const i = s.bonusTiles.pool.findIndex(t=>t.id===id)
    check(i >= 0,'다음 라운드의 보너스 타일을 선택하세요.')
    s.resources.coins += s.bonusTiles.pool[i].coins
    s.bonusTiles.pool[i] = { id:s.bonusTiles.player, coins:0 }
    s.bonusTiles.player = id
  }
  s.passed.push('player')
  endTurn(s,'player')
}

// All commands are atomic: a failed payment or illegal destination leaves the prior state usable.
export function play(previous,a) {
  check(previous.phase !== 'finished','이미 종료된 대국입니다.')
  const s = structuredClone(previous)
  if (s.bookChoices) {
    check(a.kind === 'choose-book','받을 책의 분야를 선택하세요.')
    economy.chooseBook(s,a.discipline)
  } else if (s.pending.length) resolveChoice(s,a)
  else if (s.actor === 'automa') {
    check(a.kind === 'automa','오토마 차례입니다.')
    const result = botTurn(s)
    Object.assign(s,result.state)
    addLog(s,result.summary)
    if (result.passed) s.passed.push('automa')
    if (result.powerOffered) s.pending.push({kind:'power-offer',amount:result.powerOffered})
    endTurn(s,'automa')
  } else if (a.kind === 'river-city') effects.foundRiverCity(s,a.hex,tileContext)
  else if (a.kind === 'convert') economy.convertResource(s,a.id,a.discipline)
  else if (a.kind === 'end-turn') {
    check(s.actionTaken,'먼저 행동을 선택하세요.')
    endTurn(s,'player')
  } else {
    check(!s.actionTaken,'이번 차례의 행동을 이미 수행했습니다.')
    if (a.kind === 'pass') pass(s,a.id)
    else s.actionTaken = regularAction(s,a) !== 'extra-action'
  }
  if (!['automa','end-turn'].includes(a.kind)) addLog(s, actionDescription(a,s))
  settle(s)
  return s
}

export const labels = { banking:'은행학',law:'법학',engineering:'공학',medicine:'의학',workshop:'작업장',guild:'교역소',school:'양성소',university:'대학',palace:'궁전',tower:'탑',monument:'기념물',river:'강',lake:'호수',wasteland:'황무지',swamp:'늪',forest:'숲',desert:'사막',plains:'평원',mountain:'산',sailing:'항해',terraforming:'지형 변환',power:'파워',tool:'도구',coin:'코인',scholar:'학자',city:'도시',innovation:'혁신', 'spade-spent':'삽 사용', 'science-advance':'과학 전진','palace-or-university':'궁전·대학','sailing-or-terraforming-advance':'항해·지형 변환 발전','workshop-on-border':'경계 작업장' }

export function actionDescription(a,state) {
  if (['tile-action','tile-choice','river-city'].includes(a.kind)) return effects.tileLabel(a,labels)
  const subject = labels[a.discipline] ?? ''
  const travel = a.travel === 'flight' ? '비행 · ' : a.travel === 'tunnel' ? '굴 파기 · ' : ''
  switch (a.kind) {
    case 'automa': return '오토마 차례 진행'
    case 'end-turn': return '차례 마치기'
    case 'pass': return a.id ? `패스 · ${economy.bonusTiles[a.id].label}` : '패스 · 최종 정산'
    case 'power-offer': return a.accept ? '파워 수락' : '파워 거절'
    case 'key': return a.accept ? '열쇠 사용 · 과학 전진' : '열쇠 보관'
    case 'terraform': return travel + [a.hex, a.build ? '작업장 건설' : `${labels[a.terrain ?? state?.playerTerrain]} 지형 변환`].join(' · ')
    case 'finish-build': return `${travel}${a.hex} · 작업장 건설`
    case 'mole-bridge': return `두더지족 다리 · ${a.from} ↔ ${a.to}`
    case 'upgrade': return `${a.hex} · ${labels[a.building]} 개량`
    case 'track': return `${labels[a.track]} 발전`
    case 'scholar': return `${subject} · ${a.slot === -1 ? '학자 반환 (+1)' : a.slot === 0 ? '학자 배치 (+3)' : '학자 배치 (+2)'}`
    case 'innovation': return tiles.innovationNames[a.id]
    case 'book': return tiles.bookActions[a.id].name
    case 'power': return ['','다리 건설','학자 1명','도구 2개','코인 7개','삽 1개','삽 2개'][a.id] + ` · 파워 ${powerActionCost(state ?? {},powers[a.id])}`
    case 'special':
      if (a.source === 'philosophers') return '철학자 · 원하는 책 1권'
      if (a.source === 'psychics') return '초능력자 · 파워 5와 추가 행동'
      return a.source === 'competency' ? '적성 타일 · 파워 4' : `보너스 타일 행동 ${subject}`
    case 'choose-book': return `${subject} 책 받기`
    case 'pay-book': return `${subject} 책 지불`
    case 'science': return `${subject} 전진`
    case 'competency': return tiles.competencyRewards[a.id].name
    case 'city': return tiles.cityRewards[a.id].name
    case 'palace': return tiles.palaceRewards[a.id].name
    case 'skip': return '남은 삽 사용 마치기'
    case 'annex': return `${a.hex} · 별관`
    case 'tower': return a.skip ? '탑 배치 생략' : `${a.hex} · 중립 탑`
    case 'convert': return [economy.resourceConversions[a.id],subject].filter(Boolean).join(' · ')
    default: return a.kind
  }
}
