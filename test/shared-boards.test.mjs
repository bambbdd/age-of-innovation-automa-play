import assert from 'node:assert/strict'
import test from 'node:test'
import { createFirstGame, play } from '../src/game/first-game.mjs'
import { inspectedTile, ownedTiles, sharedBoards } from '../src/ui/shared-boards.mjs'

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
  const held=ownedTiles(s)
  for (const path of ['competency/12','innovation/5','palace/10']) assert.ok(held.includes(path+'.webp'))
  assert.ok(!held.includes('innovation/6.webp'))
  assert.equal(inspectedTile('innovation',5,s.deal,s)[1],'플레이어 보유')
  assert.equal(inspectedTile('innovation',6,s.deal,s)[1],'오토마 보유')
  assert.match(inspectedTile('innovation',7,s.deal,s)[1],/은행학 2권 · 자유 책 4권 · 코인 5개/)
})
