import assert from 'node:assert/strict'
import test from 'node:test'
import { createFirstGame, play, subjects } from '../src/game/first-game.mjs'
import { choiceRows } from '../src/ui/choices.mjs'
import { chargePower, offerPower, remainingResourcePoints } from '../src/game/player-economy.mjs'
import { terrainAt } from '../src/game/board-rules.mjs'

const initial = () => createFirstGame({bonus:2})

test('initial income, one paid action, optional conversions, and atomic failed payments', () => {
  const start = initial()
  assert.deepEqual(start.resources, {coins:17,tools:6,scholars:1,bowls:[4,8,0],
    books:{banking:0,law:0,engineering:0,medicine:0}})
  assert.equal(start.playerScience.law,3)
  const guild = play(start,{kind:'upgrade',hex:'A2',building:'guild'})
  assert.equal(guild.resources.coins,11)
  assert.equal(guild.resources.tools,4)
  assert.throws(()=>play(guild,{kind:'pass',id:3}),/이미 수행/)
  const converted = play(guild,{kind:'convert',id:'toolCoin'})
  assert.equal(converted.resources.coins,12)
  assert.equal(play(converted,{kind:'end-turn'}).actor,'automa')
  const poor = {...start,resources:{...start.resources,coins:0}}
  const snapshot = structuredClone(poor)
  assert.throws(()=>play(poor,{kind:'upgrade',hex:'A2',building:'guild'}))
  assert.deepEqual(poor,snapshot)
})

test('two bowls charge in sequence, power collection costs actual charge minus one', () => {
  const s = initial()
  s.resources.bowls = [1,2,1]
  assert.equal(chargePower(s,2),2)
  assert.deepEqual(s.resources.bowls,[0,2,2])
  assert.equal(offerPower(s,4,false),0)
  const points = s.points.player
  assert.equal(offerPower(s,4,true),2)
  assert.equal(s.points.player,points-1)
  s.points.player=0
  s.resources.bowls=[0,4,0]
  assert.equal(offerPower(s,3,true),1)
  assert.equal(s.points.player,0)
})

test('school upgrade grants chosen competency, its printed reward and discipline slot once', () => {
  const s = initial()
  s.buildings.find(b=>b.hex==='A2').building='guild'
  const school=play(s,{kind:'upgrade',hex:'A2',building:'school'})
  assert.equal(school.pending[0].kind,'competency')
  const rows=choiceRows(school,'보드',null)
  assert.equal(rows.filter(r=>r.enabled).length,12)
  const chosen=play(school,{kind:'competency',id:6})
  assert.deepEqual(chosen.competencies,[6])
  assert.equal(chosen.points.player,25)
  assert.equal(chosen.resources.coins,14)
  assert.equal(chosen.resources.tools,4)
  assert.throws(()=>play(chosen,{kind:'competency',id:6}))
})

test('innovation reserves original colored cost then spends chosen remaining books before a single award', () => {
  const s=initial()
  s.round=3
  s.scoring.triggers=[{action:'innovation',points:5}]
  s.playerScience.engineering=4
  s.resources.books={banking:0,law:2,engineering:2,medicine:1}
  const choice=play(s,{kind:'innovation',id:10})
  assert.equal(choice.pending[0].kind,'pay-book')
  assert.equal(choice.points.player,20)
  assert.equal(choice.resources.coins,12)
  assert.equal(choice.resources.books.engineering,0)
  assert.throws(()=>play(choice,{kind:'pay-book',discipline:'banking'}))
  let next=choice
  for(const discipline of ['law','law','medicine']) next=play(next,{kind:'pay-book',discipline})
  assert.deepEqual(next.innovations.player,[10])
  assert.ok(!next.innovations.pool.includes(10))
  assert.equal(next.points.player,32)
})

test('a city key is optional at science level eight and a committed scholar stays on the track', () => {
  const s=initial()
  s.keys=1
  s.playerScience.banking=7
  const choice=play(s,{kind:'scholar',discipline:'banking',slot:0})
  assert.equal(choice.scholarSlots.banking[0],'player')
  assert.equal(choice.playerScience.banking,7)
  assert.equal(play(choice,{kind:'key',accept:false}).keys,1)
  const accepted=play(choice,{kind:'key',accept:true})
  assert.equal(accepted.playerScience.banking,10)
  assert.equal(accepted.keys,0)
})

test('a free spade may terraform first and then build with the printed workshop cost', () => {
  let s=createFirstGame({bonus:3})
  s=play(s,{kind:'choose-book',discipline:'banking'})
  s=play(s,{kind:'special',source:'bonus'})
  const steps=choiceRows(s,'보드','A1').filter(r=>r.enabled)
  assert.ok(steps.some(r=>r.action.terrain==='mountain'))
  s=play(s,{kind:'terraform',hex:'A1',terrain:'mountain',build:false})
  assert.equal(s.resources.tools,6)
  assert.equal(terrainAt(s,'A1'),'mountain')
  s=play(s,{kind:'finish-build',hex:'A1'})
  assert.equal(s.resources.tools,5)
  assert.equal(s.resources.coins,15)
  assert.ok(s.buildings.some(b=>b.hex==='A1'&&b.owner==='player'))
})

test('six-round browser command sequence scores once, preserves passes and has no round-six income', () => {
  let s=createFirstGame()
  s=play(s,{kind:'choose-book',discipline:'banking'})
  s=play(s,{kind:'upgrade',hex:'A2',building:'guild'})
  s=play(s,{kind:'end-turn'})
  for (let i=0;i<120 && !s.final;i++) {
    const p=s.pending[0]
    const action=s.bookChoices?{kind:'choose-book',discipline:'banking'}:
      p?.kind==='power-offer'?{kind:p.kind,accept:true}:p?.kind==='spades'?{kind:'skip'}:
      s.actor==='automa'?{kind:'automa'}:{kind:'pass',id:s.bonusTiles.pool[0].id}
    s=play(s,action)
  }
  assert.equal(s.phase,'finished')
  assert.equal(s.round,6)
  assert.deepEqual(s.points,{player:50,automa:116})
  assert.equal(s.log.filter(l=>l.text==='수입 수령').length,6)
  assert.equal(s.log.filter(l=>l.text.includes('라운드 종료 · 과학 보너스')).length,5)
  for (const who of ['player','automa']) {
    const science=subjects.reduce((n,k)=>n+s.final.science[k][who],0)
    assert.equal(s.points[who],s.final.before[who]+s.final.area.points[who]+science+
      (who==='player'?remainingResourcePoints(s):0))
  }
  assert.throws(()=>play(s,{kind:'automa'}),/종료/)
})
