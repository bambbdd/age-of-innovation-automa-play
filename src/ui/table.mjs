import { setupSelection, startingPieces } from './setup-options.mjs'
import { playerFactionNames, playerFactionDescriptions } from '../game/player-factions.mjs'
import { botDescriptions, achievementNames } from '../game/automa-factions.mjs'
import { botFactionNames } from '../game/automa-turn.mjs'
import { firstDeal, pointsFromLog, subjects, labels } from '../game/first-game.mjs'
import { startSession, sessionAction, resumeSession, sessionDeal, saveKey, writeSession, SaveConflict } from '../game/session.mjs'
import { bonusTiles } from '../game/player-economy.mjs'
import { smallBoard, nativeTerrains } from '../game/small-board.mjs'
import { createSetupDeal, difficultyLevels, initialAutomaWorkshops } from '../game/setup.mjs'
import { roundTiles, finalTiles, roundScoring } from '../game/score-tiles.mjs'
import { terrainAt } from '../game/board-rules.mjs'
import { hexCenter } from '../render/draw-small-board.mjs'
import { categories, choiceRows, boardTargets } from './choices.mjs'

const app = document.querySelector('#app')
const notice = document.querySelector('#notice')
let deal = firstDeal()
let config = setupSelection(deal)
let market = 'starter'
const humanName = () => playerFactionNames[(state ?? config).playerFaction]
const botName = () => botFactionNames[(state ?? config).automaFaction]
const terrainOrder = ['forest','mountain','desert','plains','lake','wasteland','swamp','river']
const symbols = {workshop:'⌂',guild:'♜',school:'✦',university:'♝',palace:'♛',tower:'♖',monument:'◆'}
const descriptions = { 'tile-choice':'타일 효과를 선택하세요. 배치가 필요하면 지도에서 칸을 고르세요.', 'spades':'지도에서 변환할 빈 땅을 선택하세요. 첫 칸에 건설하려면 남은 삽을 먼저 배분하세요.',
  'pay-book':'지불할 책의 분야를 선택하세요.',science:'전진할 과학 분야를 선택하세요.',
  competency:'획득할 적성 타일을 선택하세요.',palace:'궁전 타일을 선택하세요.',city:'도시 설립 보상을 선택하세요.',
  tower:'새 중립 탑을 놓을 빈 땅을 선택하세요.',key:'과학 8단계에 진입하는 데 도시 열쇠 하나를 사용할 수 있습니다.' }
let state = null, view = 'game', selected = null, category = '보드'
let session = null, savedRaw = null, saveStatus = '', saveError = false, busy = false
let rows = []

function openSavedGame() {
  const raw = localStorage.getItem(saveKey)
  savedRaw = raw
  if (raw===null) return false
  showSession(resumeSession(raw))
  saveError=false
  saveStatus='저장한 대국을 열었습니다.'
  return true
}

function showSession(loaded) {
  session=loaded
  state=loaded.state
  deal=state.deal
  market=loaded.record.market
  const setup=loaded.record.setup
  config=setupSelection(deal,{...setup,hexes:setup.playerBuildings.map(b=>b.hex),
    towerSlot:Math.max(0,setup.playerBuildings.findIndex(b=>b.building==='tower'))})
  category='보드'
  selected=null
}

async function acceptSession(next) {
  try {
    const write=()=>{ savedRaw=writeSession(localStorage,savedRaw,next.record) }
    if (navigator.locks) await navigator.locks.request(saveKey,write)
    else write()
    saveStatus='이 브라우저에 자동 저장됨'
    saveError=false
  } catch (error) {
    saveError=true
    if (error instanceof SaveConflict) {
      saveStatus=error.message
      return
    }
    saveStatus='자동 저장 실패 · 이 탭을 열어 두고 브라우저 저장 공간을 확인하세요.'
  }
  session=next
  state=next.state
}

function saveControls() {
  const status=saveStatus ? '<p class="save-status" role="status">'+esc(saveStatus)+'</p>' : ''
  const reload=saveError ? '<button class="soft" data-load>저장한 대국 다시 열기</button>' : ''
  const leave=state && !state.final ? '<button class="soft" data-new>대국 설정으로</button>' : ''
  return status+reload+leave
}

let targetState = null, targetCategory = null, targets = []
const esc = x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const panel = (title,content) => `<section class="panel"><h2>${title}</h2>${content}</section>`
const coord = id => hexCenter(smallBoard.find(c=>c.id===id))
function map() {
  const pieces = state?.buildings ?? [...initialAutomaWorkshops(config.automaTerrain,deal.setupCardId),
    ...startingPieces(config).map(piece=>({...piece,owner:'player'}))]
  if (targetState !== state || targetCategory!==category) {
    targets=state ? boardTargets(state,category) : []
    targetState=state
    targetCategory=category
  }
  const lastBot=state?.log.findLast(entry=>entry.bot)
  const decisions=lastBot?.decisions??[]
  const botHexes=new Set(decisions.flatMap(d=>d.hexes))
  const bridges = (state?.builtBridges ?? []).map(([a,b])=>{
    const p=coord(a), q=coord(b)
    return `<line x1="${p.x}" y1="${p.y-66.5}" x2="${q.x}" y2="${q.y-66.5}" stroke="#63391e" stroke-width="15"/><line x1="${p.x}" y1="${p.y-66.5}" x2="${q.x}" y2="${q.y-66.5}" stroke="#e4b77e" stroke-width="7"/>`
  }).join('')
  const cells = smallBoard.filter(c=>c.terrain!=='river' || targets.includes(c.id) || state?.riverCities?.includes(c.id)).map(c=>{
    const p=hexCenter(c), b=pieces.find(piece=>piece.hex===c.id)
    const type = state ? terrainAt(state,c.id) : c.terrain
    const tool=state?.botSpecial.tools?.includes(c.id), riverCity=state?.riverCities?.includes(c.id)
    const token = tool ? '공생체족 도구' : riverCity ? '강 도시' : ''
    const target = state ? targets.includes(c.id) : c.terrain===config.playerTerrain
    const description = [c.id,labels[type],token,b?.neutral && '중립',b && (b.owner==='automa'?botName():humanName()),b && labels[b.building],b?.marked && '표시',target && '선택 가능',botHexes.has(c.id) && '오토마 선택'].filter(Boolean).join(' ')
    const index=terrainOrder.indexOf(type)
    const change = c.terrain===type ? '' : `<span class="terrain-change" style="background-position:${index%4*100/3}% ${Math.floor(index/4)*100}%"></span>`
    return `<button class="map-cell ${target?'target':''} ${c.id===selected?'selected':''}" style="left:${p.x/16.8}%;top:${(p.y-66.5)/10.9}%" data-cell="${c.id}" aria-label="${description}" title="${description}">${change}${botHexes.has(c.id)?'<span class="bot-location" aria-hidden="true"></span>':''}${token ? `<span class="board-token">${tool?'■':'⚑'}</span>`:''}${b ? `<span class="piece ${b.owner==='automa'?'bot':''} ${b.marked?'mark':''}">${symbols[b.building]}${b.neutral?'▫':''}${b.annex?'⁺':''}</span>`:''}</button>`
  }).join('')
  return `<section class="panel"><div class="bar"><h2>게임 지도</h2><small>작은 보드 · 1–3인용</small></div><div class="map-frame"><img src="./public/boards/small-board.png" alt="작은 보드의 지형과 다리터"><svg class="map-svg" viewBox="0 0 1680 1090" aria-hidden="true">${bridges}</svg>${cells}</div>
    <div class="map-key"><span><i class="dot"></i>${humanName()}</span><span><i class="dot gold"></i>${botName()}</span><span><i class="dot purple"></i>표시 건물</span><span>• 선택 가능</span>${botHexes.size?'<span>◎ 오토마 선택</span>':''}</div>
    ${decisions.length?`<details class="bot-decision" open><summary>오토마 선택 근거 · R${lastBot.round}</summary><p>${esc(lastBot.text)}</p>${decisionList(decisions)}</details>`:''}
    ${state && !(decisions.length && state.log.at(-1)===lastBot) ? `<div class="latest" aria-live="polite">${esc(state.log.at(-1)?.text ?? '')}</div>`:''}</section>`
}
function decisionList(decisions) {
  return decisions.map(d=>'<ol>'+d.reasons.map(reason=>'<li>'+esc(reason)+'</li>').join('')+'</ol>').join('')
}

function records() {
  if (!state) return panel('행동 내역','<p>대국을 시작하면 행동과 승점이 기록됩니다.</p>')
  const totals=pointsFromLog(state.log)
  const entries=state.log.toReversed().map(entry=>{
    const amounts=[['player','나'],['automa','오토마']].filter(([k])=>entry.delta?.[k])
      .map(([k,name])=>name+' '+(entry.delta[k]>0?'+':'')+entry.delta[k]+'점').join(' · ')
    const why=entry.decisions?.length ? '<details><summary>선택 근거</summary>'+decisionList(entry.decisions)+'</details>' : ''
    return '<li><small>R'+entry.round+'</small><div>'+esc(entry.text)+(amounts?'<strong class="score-change">'+amounts+'</strong>':'')+why+'</div></li>'
  })
  return panel('행동 내역','<p class="summary-line">기록 합계 · '+humanName()+' '+totals.player+'점 / '+botName()+' '+totals.automa+'점</p><ol class="log">'+entries.join('')+'</ol>')
}

function roster() {
  const team = (other,title,terrain,pts)=>`<div class="team ${other?'other':''}"><small>${other?'오토마':'플레이어'} · ${terrain}</small><strong>${title}<span class="vp">${pts} <small>VP</small></span></strong></div>`
  const r=state?.resources
  const stats=r ? [['코인',r.coins],['도구',r.tools],['학자',r.scholars],['파워 III',r.bowls[2]]] : []
  return `<section class="panel"><div class="roster">${team(false,humanName(),labels[(state??config).playerTerrain],state?.points.player??20)}${team(true,botName(),labels[(state??config).automaTerrain],state?.points.automa??20)}</div>${r?`<div class="resources">${stats.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`:''}</section>`
}
function setup() {
  const field = (key,title,pairs,value) => `<label class="label" for="${key}">${title}</label><select id="${key}">${pairs.map(([id,name])=>`<option value="${id}" ${id===value?'selected':''}>${name}</option>`).join('')}</select>`
  const plans=deal.planningOffers.flatMap(o=>o.factions.map(f=>[f,labels[o.terrain]+' · '+playerFactionNames[f]]))
  const home=smallBoard.filter(c=>c.terrain===config.playerTerrain)
  const placement=startingPieces(config).map(({hex,building},i)=>field('start-'+i,`${i+1}번째 배치 · ${labels[building]}`,home.map(c=>[c.id,c.id+' · '+labels[c.terrain]]),hex)).join('')
  const resume=session ? '<button class="primary" data-resume>'+ (session.state.final?'마지막 대국 결과 보기':'진행 중인 대국 이어하기')+'</button>' : ''
  return panel('대국 설정',`${resume}${field('difficulty','난이도',Object.keys(difficultyLevels).map(k=>[k,k]),deal.difficulty)}
    ${field('playerFaction','계획판 · 플레이어 종족',plans,config.playerFaction)}
    <p class="hint">${playerFactionDescriptions[config.playerFaction]}</p>
    ${field('automaFaction','오토마 종족',Object.entries(botFactionNames),config.automaFaction)}
    <p class="hint">${botDescriptions[config.automaFaction]}</p>
    ${field('automaTerrain','오토마 고향 지형',nativeTerrains.filter(t=>t!==config.playerTerrain).map(t=>[t,labels[t]]),config.automaTerrain)}
    <div class="chips"><button class="soft" data-redeal>새 카드 배분</button><button class="soft" data-starter>첫 대국 구성</button></div>
    <small class="muted">배분 번호 ${deal.seed} · ${market==='starter'?'첫 대국 시장':'일반 시장'}</small>
    ${config.playerFaction==='omar'?field('towerSlot','중립 탑 배치 순서',[0,1,2].map(i=>[i,(i+1)+'번째']),config.towerSlot):''}
    ${placement}${field('bonus','라운드 보너스',deal.bonusTiles.choices.map(id=>[id,bonusTiles[id].label]),config.playerBonus)}
    <button class="primary" data-start-game>${session || savedRaw!==null?'기존 대국을 교체하고 시작':'대국 시작'}</button>${saveControls()}`)
}
function controls() {
  if (state.phase==='finished') return panel('대국 종료','<p>최종 점수와 분야별 계산 결과를 확인하세요.</p><button class="primary" data-new>새 대국 준비</button>')
  const p=state.pending[0]
  const decision = state.bookChoices || p
  const bot = state.actor==='automa'
  const heading = state.bookChoices ? '받을 책 선택' : p?.kind==='power-offer' ? '인접 건물의 파워' : p ? '효과 처리' : bot ? botName()+' 차례' : state.actionTaken ? '행동 완료' : '내 차례'
  let hint = state.bookChoices ? `원하는 분야의 책을 ${state.bookChoices}권 선택하세요.` : p?.kind==='power-offer' ? `인접한 건물에서 파워 ${p.amount}개를 제안했습니다. 실제로 받는 파워보다 1 적은 승점을 지불합니다.` : p ? descriptions[p.kind] : bot ? '카드를 공개하면 오토마의 행동과 점수를 적용합니다.' : state.actionTaken ? '필요한 자원 교환을 마치고 차례를 넘기세요.' : category==='보드' ? '지도에서 건설할 칸이나 개량할 건물을 선택하세요.' : ''
  if (selected && (category==='보드' || p?.kind==='spades' || p?.kind==='tower') && !state.bookChoices && !bot) hint += ` 선택한 칸 · ${selected} ${labels[terrainAt(state,selected)]}`
  const tabs = !decision && !bot ? (state.actionTaken ? ['행동 완료','자원 교환'] : categories) : []
  rows = choiceRows(state,category,selected)
  const actions = rows.map((r,i)=>`<button class="choice" data-action="${i}" ${r.enabled?'':'disabled'}>${esc(r.label)}${r.info?`<small>${esc(r.info)}</small>`:''}</button>`).join('')
  return panel(heading,`<p class="hint">${hint??''}</p>${tabs.length?`<div class="chips">${tabs.map(t=>`<button class="chip ${t===category || (state.actionTaken && t==='행동 완료'&&category!=='자원 교환')?'active':''}" data-category="${t}">${t}</button>`).join('')}</div>`:''}<div class="actions">${actions}</div>`)
}
function ledger() {
  if (!state) return ''
  const s=state
  const trs=subjects.map(k=>`<tr><td>${labels[k]}</td><td>${s.playerScience[k]}</td><td>${s.automaScience[k]}</td><td>${s.resources.books[k]}</td></tr>`).join('')
  const rounds = s.deal.scoreTiles.rounds.map((id,i)=>{
    const scoring=roundScoring(i+1,roundTiles.find(t=>t.id===id),finalTiles.find(t=>t.id===s.deal.scoreTiles.final))
    const b=scoring.scienceBonus
    const rewardName={coin:'코인',tool:'도구',power:'파워',scholar:'학자',spade:'삽','book-of-choice':'자유 책'}
    const end=b ? `${labels[scoring.discipline]} ${b.levels}칸당 ${rewardName[b.reward]} ${b.amount}` : '최종 정산'
    return `<tr><td>${i+1}</td><td>${scoring.triggers.map(t=>labels[t.action]+' '+t.points+'점').join(' · ')}</td><td>${end}</td></tr>`
  }).join('')
  const special=s.botSpecial
  let factionStatus=''
  if (special.youth) factionStatus='청년 지형 · '+labels[special.youth]+' / 도구 '+special.tools.length+'개'
  if (special.fallow) factionStatus='휴경지 · '+labels[special.fallow]+' → 황폐지 · '+labels[special.blighted]
  if (special.goals) factionStatus=special.goals.map(id=>(special.completed.includes(id)?'✓ ':'○ ')+achievementNames[id]).join(' / ')
    +' · 먼저 패스 '+special.early+'회, 나중에 패스 '+special.late+'회, 코인 '+special.coins+'개'
  return `<details class="panel ledger" open><summary>과학과 자원</summary><table><thead><tr><th>분야</th><th>${humanName()}</th><th>${botName()}</th><th>내 책</th></tr></thead><tbody>${trs}</tbody></table>
    <p class="summary-line">파워 그릇 I · II · III &nbsp; <b>${s.resources.bowls.join(' / ')}</b></p>
    <p class="summary-line">항해 ${s.sailing} · 삽당 도구 ${3-s.terraforming} · 열쇠 ${s.keys}</p>
    <p class="summary-line">보너스 타일 · ${bonusTiles[s.bonusTiles.player].label}</p>
    ${factionStatus?`<p class="summary-line"><b>${botName()}</b> · ${factionStatus}</p>`:''}</details>
    <details class="panel ledger"><summary>라운드별 득점과 과학 보너스</summary><table><tr><th>라운드</th><th>행동 득점</th><th>종료 보너스</th></tr>${rounds}</table></details>`
}
function scores() {
  const f=state.final, [p,b]=[state.points.player,state.points.automa]
  const points=[['대국 중 승점',f.before],['영역',f.area.points],...subjects.map(k=>[labels[k],f.science[k]]),['잔여 자원',{player:f.resources,automa:0}],['오토마 종족 보너스',{player:0,automa:f.automaFaction}],['합계',state.points]]
  return `<section class="article panel result"><h2>${p===b?'공동 승리':(p>b?humanName():botName())+' 승리'}</h2><table><tr><th>점수 항목</th><th>${humanName()}</th><th>${botName()}</th></tr>${points.map(([k,v])=>`<tr><td>${k}</td><td>${v.player}</td><td>${v.automa}</td></tr>`).join('')}</table></section>`
}
function render() {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view===view))
  const r=state?.round??0
  const title=view==='records'?'대국 기록':view==='guide'?'게임 안내':state?.final?'최종 정산':state?'게임 테이블':'첫 대국 준비'
  let content=`<div class="intro"><div><h1>${title}</h1><p>${labels[(state??config).playerTerrain]} ${humanName()} vs. ${labels[(state??config).automaTerrain]} ${botName()} · ${deal.difficulty}</p></div><div class="rounds"><span>라운드</span>${Array.from({length:6},(_,i)=>i+1===r?`<b>${i+1}</b>`:`<i class="${i+1<r?'done':''}">${i+1}</i>`).join('')}</div></div>`
  if (view==='records') content+=records()
  else if (view==='guide') content+=`<article class="panel article"><h2>대국 설정</h2><p>난이도와 오토마 종족을 정하고, 배분된 세 계획판에서 플레이어 종족을 고르세요. 새 카드 배분은 선택 가능한 종족과 타일을 바꿉니다.</p><h2>내 차례</h2><p>지도에서 칸을 눌러 지형 변환·건설·개량 비용을 확인하세요. 과학·발전, 혁신·책, 파워 행동도 한 차례에 하나씩 선택할 수 있습니다. 자원 교환은 행동 전후에 가능합니다.</p><h2>오토마와 패스</h2><p>오토마 차례에는 행동 카드와 지원 카드를 공개합니다. 인접 건물이 주는 파워는 수락하거나 거절할 수 있습니다. 먼저 패스한 쪽이 다음 라운드를 시작합니다.</p><h2>최종 점수</h2><p>6라운드에 양측이 패스하면 가장 큰 연결 영역, 네 과학 분야의 순위, 남은 자원을 정산합니다. 승점이 같으면 공동 승리입니다.</p></article>`
  else {
    const scoring=state?.scoring && !state.final ? panel('라운드 득점',state.scoring.triggers.map(t=>`<p class="summary-line">${labels[t.action]??t.action} · ${t.points}점</p>`).join('')+`<p class="muted">${botName()} 패스 · ${state.scoring.automaPoints}점</p>`) : ''
    content+=`${state?.final?scores():''}<div class="layout"><div>${map()}${ledger()}</div><aside class="side">${roster()}${state?controls()+saveControls():setup()}${scoring}</aside></div>`
  }
  app.innerHTML=content
}
let nextSetupSlot=0
document.addEventListener('click',async event=>{
  const el=event.target.closest('button')
  if (!el || busy) return
  busy=true
  notice.textContent=''
  try {
    if (el.dataset.view) view=el.dataset.view
    else if ('startGame' in el.dataset) { await acceptSession(startSession(deal,market,{...config,playerBuildings:startingPieces(config)})); selected=null }
    else if ('load' in el.dataset) { if (!openSavedGame()) throw new Error('저장한 대국을 찾을 수 없습니다.') }
    else if ('resume' in el.dataset) showSession(session)
    else if ('redeal' in el.dataset || 'starter' in el.dataset) {
      market='starter' in el.dataset ? 'starter' : 'standard'
      deal=market==='starter' ? firstDeal() : createSetupDeal({seed:crypto.getRandomValues(new Uint32Array(1))[0],difficulty:deal.difficulty})
      config=setupSelection(deal,market==='starter'?{}:config)
      nextSetupSlot=0
      selected=null
    }
    else if ('new' in el.dataset) { state=null; selected=null; category='보드' }
    else if (el.dataset.cell) {
      const id=el.dataset.cell
      if (!state) {
        if (smallBoard.find(c=>c.id===id).terrain!==config.playerTerrain) return
        const existing=config.hexes.indexOf(id)
        if (existing>=0) nextSetupSlot=existing
        else { config.hexes[nextSetupSlot]=id; nextSetupSlot=(nextSetupSlot+1)%config.hexes.length }
      }
      selected=id
      if (category!=='파워·특수') category='보드'
    } else if (el.dataset.category) { category=el.dataset.category; selected=null }
    else if (el.dataset.action!=null) {
      const a=rows[Number(el.dataset.action)].action
      await acceptSession(sessionAction(session,a))
      if (a.kind!=='convert') { category='보드'; selected=null }
    } else return
    render()
  } catch(error) { notice.textContent=error.message } finally { busy=false }
})
app.addEventListener('change',event=>{
  if (busy) return
  const el=event.target
  if (el.id==='difficulty') {
    deal=sessionDeal(deal.seed,el.value,market)
    config=setupSelection(deal,config)
  } else if (el.id==='playerFaction') {
    const offer=deal.planningOffers.find(o=>o.factions.includes(el.value))
    config=setupSelection(deal,{...config,playerTerrain:offer.terrain,playerFaction:el.value})
    nextSetupSlot=0
  } else if (el.id==='bonus') config.playerBonus=Number(el.value)
  else if (el.id==='towerSlot') config.towerSlot=Number(el.value)
  else if (el.id==='automaFaction' || el.id==='automaTerrain') config[el.id]=el.value
  else if (el.id.startsWith('start-')) {
    const i=Number(el.id.slice(6))
    const existing=config.hexes.indexOf(el.value)
    if (existing>=0) config.hexes[existing]=config.hexes[i]
    config.hexes[i]=el.value
    selected=el.value
  } else return
  render()
})
try { openSavedGame() } catch {
  saveError=true
  saveStatus='저장한 대국을 읽을 수 없습니다. 새 대국을 시작할 수 있습니다.'
}
render()
