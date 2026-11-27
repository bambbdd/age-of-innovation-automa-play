import { actionDescription, labels, subjects } from '../game/first-game.mjs'
import { competencyRewards, competencySlot, innovationNames, innovationSlotCost, palaceRewards } from '../game/first-game-tiles.mjs'
import { art } from './components.mjs'

const display = name => `<img class="display-print" src="./public/components/displays/${name}.webp" alt="">`
const innovationLimit = '혁신 3장을 모두 개발했습니다.'
const tileName = (kind,id) => kind==='innovation' ? innovationNames[id] : competencyRewards[id].name

export function ownedTiles(s) {
  const groups = [
    ['적성 타일','competency',s.competencies],
    ['혁신','innovation',s.innovations.player],
    ['궁전 타일','palace',s.palace ? [s.palace] : []],
  ]
  return `<div class="owned-tiles">${groups.map(([label,kind,ids])=>`<section><h3>${label}</h3>${ids.length ?
    ids.map(id=>{
      const name=kind==='palace' ? palaceRewards[id].name : tileName(kind,id)
      return `<figure>${art(kind,id)}<figcaption>${name}</figcaption></figure>`
    }).join('') : '<small>없음</small>'}</section>`).join('')}</div>`
}

function button(kind,id,content,description,selected,style='') {
  const key=kind+'-'+id
  return `<button type="button" class="display-space" data-inspect="${key}" aria-pressed="${selected===key}" aria-label="${description}" title="${description}" style="${style}">${content}</button>`
}

function slotStyle(x,y,width) {
  return `left:${x}%;top:${y}%;width:${width}%`
}

function actionStrip(kind,ids,s,selected) {
  const cells=ids.map(id=>{
    const used=s?.blocked?.[kind]?.includes(id) ?? false
    const label=actionDescription({kind,id},s)
    const token=used ? '<img class="x-token" src="./public/components/resources/x-token.png" alt="">' : ''
    return button(kind,id,art(kind+'-action',id)+token,label+(used?' · 이번 라운드 사용됨':''),selected)
  }).join('')
  return `<div class="action-strip ${kind}-strip">${cells}</div>`
}

function bookPrice(cost) {
  const books=Object.entries(cost.books).filter(([,amount])=>amount).map(([k,n])=>labels[k]+' '+n+'권')
  return [...books,'자유 책 '+cost.anyBooks+'권',...(cost.coins?['코인 '+cost.coins+'개']:[])].join(' · ')
}

function competencyBenefit(s,index) {
  const {discipline,levels,books}=competencySlot(index)
  return `${labels[discipline]} +${levels}칸 · ${labels[discipline]} 책 ${books+Number(s.playerFaction==='philosophers')}권`
}

export function sharedBoards(deal,position,selected,detail) {
  const atLimit=position.innovations.player.length>=3
  const innovations=deal.innovations.map((id,i)=>{
    const owner=position.innovations.player.includes(id)?'내 혁신':position.innovations.automa.includes(id)?'오토마':''
    const content=owner ? `<span class="slot-owner">${owner}</span>` : art('innovation',id)
    const loc=i<2 ? slotStyle(25+i*50,28,20) : slotStyle(12.5+(i-2)*25,82,20)
    return button('innovation',id,content,[innovationNames[id],owner || (atLimit?innovationLimit:bookPrice(innovationSlotCost(position,i)))].join(' · '),selected,loc)
  }).join('')
  const competencies=deal.competencies.map((id,i)=>{
    const owned=position.competencies.includes(id)
    const loc=slotStyle(16.1+(i%4)*24.8,32.3+Math.floor(i/4)*24.6,12)
    const content=art('competency',id)+(owned?'<span class="slot-owned">보유</span>':'')
    return button('competency',id,content,tileName('competency',id)+' · '+competencyBenefit(position,i)+(owned?' · 보유':''),selected,loc)
  }).join('')
  const top=innovationSlotCost(position,0), lower=innovationSlotCost(position,2)
  const actions=`<section class="panel shared-panel"><h2>공용 행동</h2>
    <h3>파워 행동</h3>${actionStrip('power',[1,2,3,4,5,6],position,selected)}
    <h3>책 행동</h3>${actionStrip('book',deal.bookActions,position,selected)}
    ${/^(power|book)-/.test(selected)?detail:''}</section>`
  const market=`<section class="panel shared-panel"><h2>혁신 · 적성 진열판</h2>
    <p class="board-note">${atLimit ? innovationLimit : `혁신 윗줄은 두 분야 책 각 2권과 자유 책 ${top.anyBooks}권, 아랫줄은 해당 분야 책 2권과 자유 책 ${lower.anyBooks}권입니다. ${top.coins?'혁신마다 코인 5개를 추가로 냅니다.':'궁전 건설로 코인 비용은 0입니다.'}`}</p>
    <div class="market-print"><div class="discipline-headings">${subjects.map(k=>`<span>${art('books',k)}${labels[k]}</span>`).join('')}</div>
    <div class="tile-display innovation-display">${display('innovation-display-2player')}${innovations}</div>
    <div class="tile-display competency-display">${display('competency-display')}${competencies}</div></div>
    <p class="board-note">적성 보상은 위에서부터 과학 3칸·책 0권, 2칸·1권, 1칸·2권입니다.${position.playerFaction==='philosophers'?' 철학자는 해당 분야 책을 1권 더 받습니다.':''}</p>
    ${/^(innovation|competency)-/.test(selected)?detail:''}</section>`
  return actions+market
}

export function inspectedTile(kind,id,deal,s) {
  if (kind==='competency') return [tileName(kind,id),competencyBenefit(s,deal.competencies.indexOf(id))]
  if (kind==='innovation') {
    const owned=s.innovations.player.includes(id)?'플레이어 보유':s.innovations.automa?.includes(id)?'오토마 보유':''
    return [tileName(kind,id),owned || (s.innovations.player.length>=3 ? innovationLimit : bookPrice(innovationSlotCost(s,deal.innovations.indexOf(id))))]
  }
  return [actionDescription({kind,id},s),s.blocked?.[kind]?.includes(id)?'이번 라운드 사용됨':'']
}
