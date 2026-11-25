import { firstDeal, createFirstGame, play, subjects, labels } from '../game/first-game.mjs'
import { bonusTiles } from '../game/player-economy.mjs'
import { smallBoard } from '../game/small-board.mjs'
import { initialAutomaWorkshops } from '../game/setup.mjs'
import { roundTiles, finalTiles, roundScoring } from '../game/score-tiles.mjs'
import { terrainAt } from '../game/board-rules.mjs'
import { hexCenter } from '../render/draw-small-board.mjs'
import { categories, choiceRows, boardTargets } from './choices.mjs'

const app = document.querySelector('#app')
const notice = document.querySelector('#notice')
const starter = firstDeal()
const terrainOrder = ['forest','mountain','desert','plains','lake','wasteland','swamp','river']
const symbols = {workshop:'⌂',guild:'♜',school:'✦',university:'♝',palace:'♛',tower:'♖'}
const descriptions = { 'spades':'지도에서 변환할 빈 땅을 선택하세요. 첫 칸에 건설하려면 남은 삽을 먼저 배분하세요.',
  'pay-book':'지불할 책의 분야를 선택하세요.',science:'전진할 과학 분야를 선택하세요.',
  competency:'새 건물의 역량 타일을 선택하세요.',palace:'궁전 타일을 선택하세요.',city:'도시 설립 보상을 선택하세요.',
  tower:'새 중립 탑을 놓을 빈 땅을 선택하세요.',key:'과학 8단계에 진입하는 데 도시 열쇠 하나를 사용할 수 있습니다.' }
let state = null, view = 'game', selected = null, category = '보드'
let hexes = ['A2','A8'], bonus = 3, rows = []
let targetState = null, targets = []
const esc = x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const panel = (title,content) => `<section class="panel"><h2>${title}</h2>${content}</section>`
const coord = id => hexCenter(smallBoard.find(c=>c.id===id))
const setupBot = initialAutomaWorkshops('desert',starter.setupCardId)
function map() {
  const pieces = state?.buildings ?? [...setupBot,...hexes.map(hex=>({hex,owner:'player',building:'workshop'}))]
  if (targetState !== state) { targets = state ? boardTargets(state) : []; targetState = state }
  const bridges = (state?.builtBridges ?? []).map(([a,b])=>{
    const p=coord(a), q=coord(b)
    return `<line x1="${p.x}" y1="${p.y-66.5}" x2="${q.x}" y2="${q.y-66.5}" stroke="#63391e" stroke-width="15"/><line x1="${p.x}" y1="${p.y-66.5}" x2="${q.x}" y2="${q.y-66.5}" stroke="#e4b77e" stroke-width="7"/>`
  }).join('')
  const cells = smallBoard.filter(c=>c.terrain!=='river').map(c=>{
    const p=hexCenter(c), b=pieces.find(piece=>piece.hex===c.id)
    const type = state ? terrainAt(state,c.id) : c.terrain
    const description = [c.id,labels[type],b && (b.owner==='automa'?'단순족':'항해사'),b && labels[b.building],b?.marked && '표시'].filter(Boolean).join(' ')
    const target = state ? targets.includes(c.id) : c.terrain==='mountain'
    const index=terrainOrder.indexOf(type)
    const change = c.terrain===type ? '' : `<span class="terrain-change" style="background-position:${index%4*100/3}% ${Math.floor(index/4)*100}%"></span>`
    return `<button class="map-cell ${target?'target':''} ${c.id===selected?'selected':''}" style="left:${p.x/16.8}%;top:${(p.y-66.5)/10.9}%" data-cell="${c.id}" aria-label="${description}" title="${description}">${change}${b ? `<span class="piece ${b.owner==='automa'?'bot':''} ${b.marked?'mark':''}">${symbols[b.building]}${b.annex?'⁺':''}</span>`:''}</button>`
  }).join('')
  return `<section class="panel"><div class="bar"><h2>게임 지도</h2><small>작은 보드 · 1–3인용</small></div><div class="map-frame"><img src="./public/boards/small-board.png" alt="작은 보드의 지형과 다리터"><svg class="map-svg" viewBox="0 0 1680 1090" aria-hidden="true">${bridges}</svg>${cells}</div>
    <div class="map-key"><span><i class="dot"></i>항해사</span><span><i class="dot gold"></i>단순족</span><span><i class="dot purple"></i>표시 건물</span><span>• 선택 가능</span></div>
    ${state ? `<div class="latest" aria-live="polite">${esc(state.log.at(-1)?.text ?? '')}</div>`:''}</section>`
}
function roster() {
  const team = (other,title,terrain,pts)=>`<div class="team ${other?'other':''}"><small>${other?'오토마':'플레이어'} · ${terrain}</small><strong>${title}<span class="vp">${pts} <small>VP</small></span></strong></div>`
  const r=state?.resources
  const stats=r ? [['동전',r.coins],['도구',r.tools],['학자',r.scholars],['마력 III',r.bowls[2]]] : []
  return `<section class="panel"><div class="roster">${team(false,'항해사','산',state?.points.player??20)}${team(true,'단순족','사막',state?.points.automa??20)}</div>${r?`<div class="resources">${stats.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`:''}</section>`
}
function setup() {
  const select = slot => `<select aria-label="${slot+1}번째 시작 작업장" data-start="${slot}">${smallBoard.filter(c=>c.terrain==='mountain').map(c=>`<option value="${c.id}" ${c.id===hexes[slot]?'selected':''}>${c.id} · 산</option>`).join('')}</select>`
  return panel('초기 배치',`<p class="hint">산 두 칸에 작업장을 놓고 첫 보너스 타일을 고르세요. 지도에서 산을 눌러 배치를 바꿀 수 있습니다.</p>
    <label class="label">첫 작업장</label>${select(0)}<label class="label">둘째 작업장</label>${select(1)}
    <label class="label" for="bonus">라운드 보너스</label><select id="bonus">${starter.bonusTiles.choices.map(id=>`<option value="${id}" ${bonus===id?'selected':''}>${bonusTiles[id].label}</option>`).join('')}</select>
    <button class="primary" data-start-game>대국 시작</button>`)
}
function controls() {
  if (state.phase==='finished') return panel('대국 종료','<p>최종 점수와 분야별 계산 결과를 확인하세요.</p><button class="primary" data-new>새 대국 준비</button>')
  const p=state.pending[0]
  const decision = state.bookChoices || p
  const bot = state.actor==='automa'
  const heading = state.bookChoices ? '받을 책 선택' : p?.kind==='power-offer' ? '인접 건물의 마력' : p ? '효과 처리' : bot ? '단순족 차례' : state.actionTaken ? '행동 완료' : '내 차례'
  let hint = state.bookChoices ? `원하는 분야의 책을 ${state.bookChoices}권 선택하세요.` : p?.kind==='power-offer' ? `인접한 건물에서 마력 ${p.amount}을 제안했습니다. 실제로 받는 마력보다 1 적은 승점을 지불합니다.` : p ? descriptions[p.kind] : bot ? '카드를 공개하면 단순족의 행동과 점수를 적용합니다.' : state.actionTaken ? '필요한 자원 교환을 마치고 차례를 넘기세요.' : category==='보드' ? '지도에서 건설할 칸이나 개량할 건물을 선택하세요.' : ''
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
    const rewardName={coin:'동전',tool:'도구',power:'마력',scholar:'학자',spade:'삽','book-of-choice':'자유 책'}
    const end=b ? `${labels[scoring.discipline]} ${b.levels}칸당 ${rewardName[b.reward]} ${b.amount}` : '최종 정산'
    return `<tr><td>${i+1}</td><td>${scoring.triggers.map(t=>labels[t.action]+' '+t.points+'점').join(' · ')}</td><td>${end}</td></tr>`
  }).join('')
  return `<details class="panel ledger" open><summary>과학과 자원</summary><table><thead><tr><th>분야</th><th>항해사</th><th>단순족</th><th>내 책</th></tr></thead><tbody>${trs}</tbody></table>
    <p class="summary-line">마력 그릇 I · II · III &nbsp; <b>${s.resources.bowls.join(' / ')}</b></p>
    <p class="summary-line">항해 ${s.sailing} · 삽당 도구 ${3-s.terraforming} · 열쇠 ${s.keys}</p>
    <p class="summary-line">보너스 타일 · ${bonusTiles[s.bonusTiles.player].label}</p></details>
    <details class="panel ledger"><summary>라운드별 득점과 과학 보너스</summary><table><tr><th>라운드</th><th>행동 득점</th><th>종료 보너스</th></tr>${rounds}</table></details>`
}
function scores() {
  const f=state.final, [p,b]=[state.points.player,state.points.automa]
  const points=[['대국 중 승점',f.before],['영역',f.area.points],...subjects.map(k=>[labels[k],f.science[k]]),['잔여 자원',{player:f.resources,automa:0}],['합계',state.points]]
  return `<section class="article panel result"><h2>${p===b?'공동 승리':p>b?'항해사 승리':'단순족 승리'}</h2><table><tr><th>점수 항목</th><th>항해사</th><th>단순족</th></tr>${points.map(([k,v])=>`<tr><td>${k}</td><td>${v.player}</td><td>${v.automa}</td></tr>`).join('')}</table></section>`
}
function render() {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view===view))
  const r=state?.round??0
  const title=view==='records'?'대국 기록':view==='guide'?'게임 안내':state?.final?'최종 정산':state?'게임 테이블':'첫 대국 준비'
  let content=`<div class="intro"><div><h1>${title}</h1><p>산의 항해사와 사막의 단순족 · Automalein</p></div><div class="rounds"><span>라운드</span>${Array.from({length:6},(_,i)=>i+1===r?`<b>${i+1}</b>`:`<i class="${i+1<r?'done':''}">${i+1}</i>`).join('')}</div></div>`
  if (view==='records') content+=`<section class="panel article"><h2>행동 내역</h2><ol class="log">${state?[...state.log].reverse().map(l=>`<li><small>R${l.round}</small>${esc(l.text)}</li>`).join(''):'<li>대국을 시작하면 여기에 행동이 기록됩니다.</li>'}</ol></section>`
  else if (view==='guide') content+=`<article class="panel article"><h2>항해사로 첫 대국 시작하기</h2><p>작업장 두 곳과 보너스 타일을 고르세요. 항해사는 법학 3에서 시작하며 강 옆에 작업장을 건설할 때마다 2점을 얻습니다.</p><h2>내 차례</h2><p>지도에서 칸을 눌러 지형 변환·건설·개량 비용을 확인하세요. 과학·발전, 혁신·책, 마력 행동도 한 차례에 하나씩 선택할 수 있습니다. 자원 교환은 행동 전후에 가능합니다.</p><h2>단순족과 패스</h2><p>단순족 차례에는 행동 카드와 지원 카드를 공개합니다. 인접 건물이 주는 마력은 수락하거나 거절할 수 있습니다. 먼저 패스한 쪽이 다음 라운드를 시작합니다.</p><h2>최종 점수</h2><p>6라운드에 양측이 패스하면 가장 큰 연결 영역, 네 과학 분야의 순위, 남은 자원을 정산합니다. 승점이 같으면 공동 승리입니다.</p></article>`
  else {
    const scoring=state && !state.final ? panel('라운드 득점',state.scoring.triggers.map(t=>`<p class="summary-line">${labels[t.action]??t.action} · ${t.points}점</p>`).join('')+`<p class="muted">단순족 패스 · ${state.scoring.automaPoints}점</p>`) : ''
    content+=`${state?.final?scores():''}<div class="layout"><div>${map()}${ledger()}</div><aside class="side">${roster()}${state?controls():setup()}${scoring}</aside></div>`
  }
  app.innerHTML=content
}
let nextSetupSlot=0
document.addEventListener('click',event=>{
  const el=event.target.closest('button')
  if (!el) return
  notice.textContent=''
  try {
    if (el.dataset.view) view=el.dataset.view
    else if ('startGame' in el.dataset) { state=createFirstGame({hexes,bonus}); selected=null }
    else if ('new' in el.dataset) { state=null; selected=null; category='보드' }
    else if (el.dataset.cell) {
      const id=el.dataset.cell
      if (!state) {
        if (smallBoard.find(c=>c.id===id).terrain!=='mountain') return
        const existing=hexes.indexOf(id)
        if (existing>=0) nextSetupSlot=existing
        else { hexes[nextSetupSlot]=id; nextSetupSlot=1-nextSetupSlot }
      }
      selected=id
      category='보드'
    } else if (el.dataset.category) category=el.dataset.category
    else if (el.dataset.action!=null) {
      const a=rows[Number(el.dataset.action)].action
      state=play(state,a)
      if (a.kind!=='convert') { category='보드'; selected=null }
    } else return
    render()
  } catch(error) { notice.textContent=error.message }
})
app.addEventListener('change',event=>{
  const el=event.target
  if (el.id==='bonus') bonus=Number(el.value)
  else if (el.dataset.start!=null) {
    const i=Number(el.dataset.start)
    if (hexes[1-i]===el.value) hexes[1-i]=hexes[i]
    hexes[i]=el.value
    selected=el.value
    render()
  }
})
render()
