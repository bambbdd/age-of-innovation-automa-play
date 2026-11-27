import test from 'node:test'
import assert from 'node:assert/strict'
import { firstDeal, pointsFromLog } from '../src/game/first-game.mjs'
import { startSession, sessionAction, resumeSession, sessionDeal, writeSession, saveKey } from '../src/game/session.mjs'
import { setupSelection, startingPieces } from '../src/ui/setup-options.mjs'
import { boardTargets, choiceRows } from '../src/ui/choices.mjs'

function start(deal=firstDeal(),market='starter') {
  const config=setupSelection(deal)
  return startSession(deal,market,{...config,playerBuildings:startingPieces(config)})
}

test('reloading after each decision reproduces the next card, pending choices, log and final score', () => {
  let live=start()
  const actions=[{kind:'choose-book',discipline:'banking'},{kind:'upgrade',hex:'A2',building:'guild'},{kind:'end-turn'}]
  const pending=new Set()
  while (!live.state.final) {
    const {state,record}=live
    const resumed=resumeSession(JSON.stringify(record))
    assert.deepEqual(resumed.state,state)
    assert.deepEqual(pointsFromLog(state.log),state.points)
    const p=state.pending[0]
    if (p) pending.add(p.kind)
    const next=actions.shift() ?? (state.bookChoices ? {kind:'choose-book',discipline:'banking'} :
      p?.kind==='power-offer' ? {kind:p.kind,accept:true} : p?.kind==='spades' ? {kind:'skip'} :
      state.actor==='automa' ? {kind:'automa'} : {kind:'pass',id:state.bonusTiles.pool[0].id})
    live=sessionAction(live,next)
    assert.deepEqual(sessionAction(resumed,next).state,live.state)
    assert.ok(live.record.actions.length<150)
  }
  assert.ok(pending.has('power-offer'))
  assert.deepEqual(pointsFromLog(live.state.log),{player:50,automa:116})
  assert.deepEqual(resumeSession(JSON.stringify(live.record)).state,live.state)
})

test('both market modes restore a non-default difficulty and reject unsupported or illegal saves', () => {
  for (const [market,seed] of [['standard',718],['starter',42]]) {
    const deal=sessionDeal(seed,'Alptrauma',market)
    const s=start(deal,market)
    assert.deepEqual(resumeSession(JSON.stringify(s.record)),s)
    assert.throws(()=>resumeSession(JSON.stringify({...s.record,version:2})),/저장 형식/)
    assert.throws(()=>resumeSession(JSON.stringify({...s.record,actions:[{kind:'fake'}]})))
    assert.deepEqual(s.record.actions,[])
  }
})

test('save conflicts and failed writes preserve the last durable game', () => {
  const data=new Map()
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}
  const s=start()
  const first=writeSession(storage,null,s.record)
  const next=sessionAction(s,{kind:'choose-book',discipline:'banking'})
  const second=writeSession(storage,first,next.record)
  assert.throws(()=>writeSession(storage,first,s.record),/다른 탭/)
  assert.equal(storage.getItem(saveKey),second)
  assert.throws(()=>writeSession({...storage,setItem(){throw new Error('quota')}},second,s.record),/quota/)
  assert.deepEqual(resumeSession(storage.getItem(saveKey)).state,next.state)
})

test('legal highlights include the follow-up workshop and only affordable special-action endpoints', () => {
  let s=sessionAction(start(),{kind:'choose-book',discipline:'banking'})
  s=sessionAction(s,{kind:'special',source:'bonus'})
  s=sessionAction(s,{kind:'terraform',hex:'A1',terrain:'mountain',build:false})
  assert.ok(boardTargets(s.state).includes('A1'))
  assert.ok(choiceRows(s.state,'보드','A1').some(r=>r.enabled && r.action.kind==='finish-build'))
  const base=sessionAction(start(),{kind:'choose-book',discipline:'banking'}).state
  base.buildings[0].hex='A6'
  base.resources.bowls=[0,0,0]
  assert.deepEqual(boardTargets(base,'파워·특수'),[])
  base.resources.bowls=[0,0,3]
  assert.ok(boardTargets(base,'파워·특수').includes('B4'))
  assert.ok(choiceRows(base,'파워·특수','B4').some(r=>r.enabled && r.action.from==='A6' && r.action.to==='B4'))
})

test('a board decision keeps its Korean reasons and selected hex in the replayed log', () => {
  let s=start()
  for (const a of [{kind:'choose-book',discipline:'banking'},{kind:'pass',id:s.state.bonusTiles.pool[0].id},
    {kind:'automa'},{kind:'automa'}]) s=sessionAction(s,a)
  const entry=s.state.log.findLast(e=>e.decisions?.length)
  const decision=entry.decisions[0]
  assert.ok(entry.text.includes(decision.hexes[0]))
  assert.ok(decision.reasons.some(r=>r.includes('지형 순위')))
  assert.ok(decision.reasons.some(r=>r.includes('표시 건물까지')))
  assert.deepEqual(resumeSession(JSON.stringify(s.record)).state.log,s.state.log)
})
