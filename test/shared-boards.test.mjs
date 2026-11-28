import assert from 'node:assert/strict'
import test from 'node:test'
import { createFirstGame, play } from '../src/game/first-game.mjs'
import { createSetupDeal } from '../src/game/setup.mjs'
import { suggestions } from '../src/ui/choices.mjs'
import { inspectedTile, sharedBoards } from '../src/ui/shared-boards.mjs'
import { personalBoard, personalStorage } from '../src/ui/personal-board.mjs'
import { collectIncome, planningIncome } from '../src/game/player-economy.mjs'

test('the palace display offers exactly the tiles available at construction', () => {
  const s=createFirstGame({bonus:2})
  s.pending=[{kind:'palace'}]
  for (const deal of [s.deal,createSetupDeal({seed:11})]) {
    s.deal=deal
    const html=sharedBoards(deal,s,null,'')
    const ids=Array.from(html.matchAll(/data-inspect="palace-(\d+)"/g),m=>Number(m[1]))
    assert.deepEqual(ids,suggestions(s,'보드',null).map(a=>a.id))
    for (const id of ids) assert.ok(html.includes('/palace/'+id+'.webp'))
  }
  const acquired=play(s,{kind:'palace',id:17})
  const held=sharedBoards(acquired.deal,acquired,'palace-17','')
  assert.match(held,/aria-label="승점 궁전 · 보유"/)
  assert.deepEqual(inspectedTile('palace',17,acquired.deal,acquired),['승점 궁전','건설 즉시 10점을 받습니다. 수입 · 파워 충전 2'])
})

test('the action boards follow Automa blocks and reopen at the start of the next round', () => {
  let s=createFirstGame({bonus:2})
  s.automaDeck.draw=[10,2,3,5]
  let sawBlock=false
  for (let i=0;i<60 && s.round===1;i++) {
    const p=s.pending[0]
    const action=s.bookChoices ? {kind:'choose-book',discipline:'banking'} :
      p?.kind==='power-offer' ? {kind:p.kind,accept:false} : p?.kind==='spades' ? {kind:'skip'} :
      s.actor==='automa' ? {kind:'automa'} : {kind:'pass',id:s.bonusTiles.pool[0].id}
    s=play(s,action)
    const html=sharedBoards(s.deal,s,null,'')
    const blocks=s.blocked.power.length+s.blocked.book.length
    assert.equal((html.match(/class="x-token"/g)??[]).length,blocks)
    if (blocks) sawBlock=true
  }
  assert.ok(sawBlock)
  assert.equal(s.round,2)
  assert.deepEqual([s.blocked.power,s.blocked.book],[[],[]])
})

test('the inventory and the original slots show which player took each innovation', () => {
  const s=createFirstGame()
  s.competencies=[12]
  s.innovations.player=[5]
  s.innovations.automa=[6]
  s.innovations.pool=s.innovations.pool.filter(id=>id!==5 && id!==6)
  s.palace=10
  const held=personalBoard(s), storage=personalStorage(s)
  for (const path of ['innovation/5','palace/10']) assert.ok(held.includes(path+'.webp'))
  assert.ok(!held.includes('competency/12.webp'))
  assert.ok(storage.includes('competency/12.webp'))
  assert.ok(!held.includes('innovation/6.webp'))
  assert.equal(inspectedTile('innovation',5,s.deal,s)[1],'플레이어 보유')
  assert.equal(inspectedTile('innovation',6,s.deal,s)[1],'오토마 보유')
  assert.match(inspectedTile('innovation',7,s.deal,s)[1],/은행학 2권 · 자유 책 4권 · 코인 5개/)
})

test('exposed slots and collected income follow the mountain board and exclude neutral buildings', () => {
  const s=createFirstGame({bonus:2})
  const pieces=(building,hexes)=>hexes.map(hex=>({owner:'player',building,hex}))
  s.buildings=[...pieces('workshop',['A2','A3','A4','A5','A6']), ...pieces('guild',['B1','B2','B3']),
    ...pieces('school',['C1']), {owner:'automa',hex:'C2',building:'guild'},
    {owner:'player',hex:'C3',building:'university',neutral:true}]
  const board=personalBoard(s)
  assert.match(board,/작업장 <b>4\/9/)
  assert.match(board,/수입 없음/)
  assert.match(board,/대학 <b>1\/1/)
  assert.match(board,/코인 3 · 파워 충전 1/)
  assert.match(board,/코인 2 · 파워 충전 2/)
  assert.deepEqual(planningIncome(s),{tools:5,coins:9,scholars:2,power:4})
  s.resources.bowls=[4,5,3]
  const before=structuredClone(s.resources)
  collectIncome(s)
  assert.equal(s.resources.tools-before.tools,5)
  assert.equal(s.resources.coins-before.coins,9)
  assert.equal(s.resources.scholars-before.scholars,2)
  assert.deepEqual(s.resources.bowls,[0,9,3])
})

test('storage distinguishes earned cities from spendable keys and the board shows income limits', () => {
  const s=createFirstGame({bonus:2})
  s.cityTiles=['tools','spades']
  s.keys=1
  s.palace=1
  s.resources.scholars=7
  s.resources.bowls=[0,0,12]
  const storage=personalStorage(s),board=personalBoard(s)
  assert.match(storage,/city\/tools.webp/)
  assert.match(storage,/city\/spades.webp/)
  assert.match(storage,/사용 가능한 열쇠<\/span><b>1/)
  assert.match(board,/파워 그릇 III에 12개/)
  assert.match(board,/현재 0 충전 가능/)
  assert.match(board,/현재 0명 수령 가능/)
  s.round=6
  assert.match(personalBoard(s),/마지막 라운드/)
})
