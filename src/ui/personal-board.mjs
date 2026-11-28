import { buildingSupply, placedFromSupply } from '../game/board-rules.mjs'
import { labels, subjects } from '../game/first-game.mjs'
import { cityRewards, competencyRewards, innovationNames, palaceRewards, tileIncome } from '../game/first-game-tiles.mjs'
import { availableScholars, baseIncome, bonusTiles, effectiveSailing, planningIncome, slotIncome, sumIncome } from '../game/player-economy.mjs'
import { playerFactionDescriptions, playerFactionNames } from '../game/player-factions.mjs'
import { art, wood } from './components.mjs'

const names={tools:'도구',coins:'코인',scholars:'학자',power:'파워 충전',points:'승점',books:'자유 책',scienceChoice:'과학 전진'}
const palaceEffects={
  1:'특수 행동으로 도구 2개를 받습니다.', 2:'특수 행동으로 삽 2개를 받아 지형 변환·건설을 합니다.',
  3:'특수 행동으로 양성소를 교역소로 교체하고 3점과 도구 1개를 받습니다.',
  4:'특수 행동으로 작업장을 교역소로 무료 개량합니다.', 5:'건설 즉시 적성 타일 1개를 획득합니다.',
  6:'특수 행동으로 한 과학 분야를 최대 2칸 전진합니다.', 7:'패스할 때 보드 위의 내 양성소마다 3점을 받습니다.',
  8:'도시 설립에 필요한 건물의 파워 합계가 6으로 줄어듭니다.',
  9:'학자 1명을 반환해 1~2칸을 비행할 수 있으며, 비행할 때마다 5점을 받습니다.',
  10:'건설 즉시 파워 12를 충전하고 자유 책 2권을 받습니다.', 11:'건설 즉시 도시 보상 1개를 받습니다.',
  12:'작업장을 건설할 때마다 2점을 받습니다.', 13:'교역소를 건설할 때마다 3점. 특수 행동으로 자유 책 1권과 코인 3개를 받습니다.',
  14:'건설 즉시 항해를 2단계 발전시킵니다. 도시 설립 시 강 한 칸을 건너 건물을 연결할 수 있습니다.',
  15:'건설 즉시 삽 2개로 지형 변환·건설, 다리 2개 건설, 자유 책 2권 획득을 원하는 순서로 처리합니다.',
  16:'건설 즉시 빈 고향 지형에 교역소 1개를 무료로 놓습니다.', 17:'건설 즉시 10점을 받습니다.',
}

function incomeText(income) {
  return Object.entries(income).filter(([,n])=>n).map(([k,n])=>names[k]+' '+n).join(' · ')
}

function reserve(s,type) {
  const placed=placedFromSupply(s,'player',type), total=buildingSupply[type]
  const slots=Array.from({length:total},(_,i)=>{
    if (i>=placed) return `<span class="stock-slot">${wood(type,s.playerTerrain)}</span>`
    const income=type==='palace' ? (palaceRewards[s.palace]?.income??{}) : slotIncome(s.playerTerrain,type,i+1)
    const icons=Object.entries(income).map(([key,n])=>{
      const symbol=key==='scholars' ? wood('scholar',s.playerTerrain) :
        ['tools','coins','power'].includes(key) ? art('resources',{tools:'tool',coins:'coin',power:'power'}[key]) : names[key]
      return `<span>${symbol}<b>${n}</b></span>`
    }).join('')
    const text=incomeText(income)||'수입 없음'
    return `<span class="stock-slot revealed" role="img" aria-label="${text}" title="${text}">${icons||'–'}</span>`
  }).join('')
  return `<div class="stock-row"><div class="stock-label">${labels[type]} <b>${total-placed}/${total}</b></div><div class="stock-slots stock-${type}">${slots}</div></div>`
}

function incomeForecast(s) {
  const receiving=['setup','income'].includes(s.phase)
  if (s.final || (s.round===6 && !receiving)) return '<section class="income-forecast"><h3>다음 라운드 수입</h3><p>마지막 라운드입니다.</p></section>'
  const income=sumIncome(planningIncome(s),tileIncome(s))
  const actual={scholars:availableScholars(s),power:2*s.resources.bowls[0]+s.resources.bowls[1]}
  const items=Object.keys(names).filter(k=>income[k]>0).map(k=>{
    const n=income[k], limit=actual[k]
    const capped=limit<n ? `<small>현재 ${limit}${k==='power'?' 충전 가능':'명 수령 가능'}</small>` : ''
    return `<li>${names[k]} <b>+${n}</b>${capped}</li>`
  }).join('')
  return `<section class="income-forecast"><h3>${receiving?s.round:s.round+1}라운드 예상 수입</h3><p>현재 건물·보유 타일·과학 단계 기준</p><ul>${items}</ul></section>`
}

function upgrades(group,title,levels,current,temporary='') {
  return `<div class="upgrade-track"><h4>${title}</h4><div>${levels.map(n=>{
    const label=(group==='ship-level'?'항해 ':'삽당 도구 ')+n
    return `<span class="upgrade-step" ${n===current?'aria-current="step"':''}>${art(group,n,label)}</span>`
  }).join('')}</div>${temporary?`<small>${temporary}</small>`:''}</div>`
}

function bowls(s) {
  return `<section class="bowl-section"><h3>파워 그릇</h3><div class="bowl-cycle">${s.resources.bowls.map((n,i)=>{
    const roman=['I','II','III'][i]
    const tokens=Array.from({length:n},()=>art('resources','power')).join('')
    return `<div class="power-bowl bowl-${i+1}" role="img" aria-label="파워 그릇 ${roman}에 ${n}개" style="background-image:url('./public/components/power-bowl/${i+1}.webp')"><div class="bowl-tokens">${tokens}</div><b>${roman} · ${n}</b></div>`
  }).join('')}</div></section>`
}

export function personalBoard(s) {
  const palace=palaceRewards[s.palace]
  const palaceSlot=palace ? `${art('palace',s.palace)}<div><strong>${palace.name.split(' · ')[0]}</strong><p>${palaceEffects[s.palace]}</p>${palace.income?`<small>수입 · ${incomeText(palace.income)}</small>`:''}</div>` : '<span class="empty-slot">궁전 건설 후 선택</span>'
  const innovations=Array.from({length:3},(_,i)=>{
    const id=s.innovations.player[i]
    return id ? `<figure>${art('innovation',id)}<figcaption>${innovationNames[id]}</figcaption></figure>` : '<div class="empty-slot">빈칸</div>'
  }).join('')
  return `<article class="player-board" aria-label="개인 보드"><header class="faction-head">${art('player-faction',s.playerFaction)}<div><small>${labels[s.playerTerrain]} 개인 보드</small><h2>${playerFactionNames[s.playerFaction]}</h2><p>${playerFactionDescriptions[s.playerFaction]}</p></div></header>
    <div class="planning-grid"><div class="planning-tracks"><section class="upgrades"><h3>발전</h3>${upgrades('ship-level','항해',[0,1,2,3],s.sailing,effectiveSailing(s)>s.sailing?'보너스 포함 항해 '+effectiveSailing(s):'')}${upgrades('spade-cost','삽당 도구',[3,2,1],3-s.terraforming)}</section>
    <section class="building-reserve"><h3>건물 재고</h3><p>남은 수 / 전체 · 빈자리는 생산 수입</p><p>기본 수입 · ${incomeText(baseIncome(s.playerTerrain))}</p>${Object.keys(buildingSupply).map(type=>reserve(s,type)).join('')}</section></div>
    <div class="planning-tiles">${bowls(s)}<section><h3>궁전 효과</h3><div class="palace-slot">${palaceSlot}</div></section>
    <section><h3>혁신</h3><div class="innovation-slots">${innovations}</div></section></div></div>${incomeForecast(s)}</article>`
}

export function personalStorage(s) {
  const tokens=[['도구',art('resources','tool'),s.resources.tools],['코인',art('resources','coin'),s.resources.coins],
    ['학자',wood('scholar',s.playerTerrain),s.resources.scholars],['사용 가능한 열쇠',art('resources','key'),s.keys]]
  const books=subjects.map(k=>`<li>${art('books',k)}${labels[k]} <b>${s.resources.books[k]}권</b></li>`).join('')
  function tile(group,id,name) {
    return `<figure>${art(group,id)}<figcaption>${name}</figcaption></figure>`
  }
  return `<section class="personal-storage" aria-label="내 보관 공간"><h2>내 보관 공간</h2><div class="stored-resources">${tokens.map(([name,icon,n])=>`<div>${icon}<span>${name}</span><b>${n}</b></div>`).join('')}</div>
    <h3>책</h3><ul class="stored-books">${books}</ul><div class="stored-tiles"><section><h3>라운드 보너스</h3>${tile('round-bonus',s.bonusTiles.player,bonusTiles[s.bonusTiles.player].label)}</section>
    <section><h3>적성 타일</h3>${s.competencies.map(id=>tile('competency',id,competencyRewards[id].name)).join('')||'<small>없음</small>'}</section>
    <section><h3>도시 타일</h3>${s.cityTiles.map(id=>tile('city',id,cityRewards[id].name)).join('')||'<small>없음</small>'}</section></div></section>`
}
