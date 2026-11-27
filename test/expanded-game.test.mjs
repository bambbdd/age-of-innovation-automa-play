import test from 'node:test'
import assert from 'node:assert/strict'
import { createSetupDeal, difficultyLevels } from '../src/game/setup.mjs'
import { createFirstGame, createGame, play, pointsFromLog } from '../src/game/first-game.mjs'
import { resolveAutomaBoardAction } from '../src/game/automa-board.mjs'
import { spadesBetween, terrainAt, openBuildHexes, terraformAndBuild } from '../src/game/board-rules.mjs'
import { checkAchievements, factionSetup, placeTool, spreadBlight } from '../src/game/automa-factions.mjs'
import { botFactionNames, applyBotPowerGain, botTurn, botEndgamePoints } from '../src/game/automa-turn.mjs'
import { playerFactionNames } from '../src/game/player-factions.mjs'
import { setupSelection, startingPieces } from '../src/ui/setup-options.mjs'
import { choiceRows } from '../src/ui/choices.mjs'

function choosePending(state) {
  if (state.bookChoices) return {kind:'choose-book',discipline:'banking'}
  const p = state.pending[0]
  if (p.kind === 'spades') return {kind:'skip'}
  if (p.kind === 'competency') return {kind:'competency',id:6}
  const choices = choiceRows(state,'보드',null)
  const option = choices.find(row => row.enabled)
  assert.ok(option, JSON.stringify(p))
  return option.action
}

test('each difficulty and Automa completes all six rounds through the selectable setup', () => {
  const seen = new Set()
  const bots = Object.keys(botFactionNames)
  assert.equal(bots.length,10)
  for (const [level,difficulty] of Object.keys(difficultyLevels).entries()) {
    for (const [i,automaFaction] of bots.entries()) {
      const deal = createSetupDeal({seed:level*17+i,difficulty})
      const offer = deal.planningOffers[i % 3]
      const config = setupSelection(deal,{playerTerrain:offer.terrain,playerFaction:offer.factions[i % 2],automaFaction})
      const pieces = startingPieces(config)
      let state = createGame(deal,{...config,playerBuildings:pieces})
      assert.equal(state.automaFaction,automaFaction)
      assert.equal(state.deal.difficulty,difficulty)
      seen.add(state.playerFaction)
      let turns = 0
      while (!state.final && ++turns <= 200) {
        let action
        if (state.pending.length || state.bookChoices) action = choosePending(state)
        else if (state.actor === 'automa') action = {kind:'automa'}
        else action = {kind:'pass',id:state.bonusTiles.pool[0].id}
        state = play(state,action)
      }
      assert.equal(state.phase,'finished',difficulty+' / '+automaFaction)
      assert.equal(state.round,6)
      assert.deepEqual(pointsFromLog(state.log),state.points)
      assert.ok(Number.isFinite(state.points.player) && Number.isFinite(state.points.automa))
      const totalBot = state.final.before.automa + state.final.area.points.automa
        + Object.values(state.final.science).reduce((sum,pts)=>sum+pts.automa,0) + state.final.automaFaction
      assert.equal(totalBot,state.points.automa)
    }
  }
  assert.deepEqual([...seen].sort(),Object.keys(playerFactionNames).sort())
})

test('changing planning display repairs incompatible placements and preserves the Omar tower order', () => {
  const deal={planningOffers:[{terrain:'mountain',factions:['navigators','omar']},
    {terrain:'swamp',factions:['monks','felines']}],bonusTiles:{choices:[2,3,7,8]}}
  const initial=setupSelection(deal,{playerFaction:'omar',towerSlot:0})
  assert.deepEqual(startingPieces(initial).map(b=>b.building),['tower','workshop','workshop'])
  const monks=setupSelection(deal,{...initial,playerTerrain:'swamp',playerFaction:'monks',automaTerrain:'swamp'})
  assert.notEqual(monks.automaTerrain,monks.playerTerrain)
  assert.equal(startingPieces(monks)[0].building,'university')
  assert.equal(monks.hexes.length,1)
})

test('one board and one support card distinguish faction builds from printed ordinary builds', () => {
  const deal=createSetupDeal({seed:1,difficulty:'Automa'})
  const expected={simpletons:'C3',kuddlers:'B3',mimics:'D3',wanderers:'A7',powermongers:'B3'}
  for (const [faction,hex] of Object.entries(expected)) {
    const config=setupSelection(deal,{automaFaction:faction})
    const s=createGame(deal,{...config,playerBuildings:startingPieces(config)})
    assert.equal(resolveAutomaBoardAction(s,'transform-and-build',1,1,faction).hex,hex,faction)
    assert.equal(resolveAutomaBoardAction(s,'transform-and-build',1,1).hex,'C3')
  }
})

test('conditional science, first-pass and endgame bonuses use their own event', () => {
  const s=createFirstGame({bonus:2})
  s.automaDeck.support=1
  s.automaFaction='powermongers'
  assert.deepEqual(applyBotPowerGain(s,1),s)
  const science=Object.values(s.automaScience).reduce((a,b)=>a+b)
  assert.equal(Object.values(applyBotPowerGain(s,2).automaScience).reduce((a,b)=>a+b),science+1)
  s.automaFaction='druids'
  s.automaDeck.draw=[1,5,2,3]
  assert.equal(Object.values(botTurn(s).state.automaScience).reduce((a,b)=>a+b),science+2)
  s.automaFaction='racelings'
  s.automaDeck.draw=[1,2]
  assert.equal(botTurn(s).state.points.automa,20+s.scoring.automaPoints*2)
  s.passed=['player']
  assert.equal(botTurn(s).state.points.automa,20+s.scoring.automaPoints)
  s.automaFaction='wanderers'
  assert.equal(botEndgamePoints(s),4)
})

test('selected achievements trigger once at their actual events', () => {
  let s=createFirstGame({bonus:2})
  s.automaFaction='gognomes'
  s.botSpecial={goals:[1,4,5],completed:[],coins:6,early:0,late:0}
  s=checkAchievements(s,{power:3})
  assert.deepEqual(s.botSpecial.completed,[1])
  assert.equal(s.points.automa,28)
  assert.equal(checkAchievements(s,{power:3}).points.automa,s.points.automa)
  s=checkAchievements(s,{pass:{first:true,coins:1}})
  assert.deepEqual(s.botSpecial.completed,[1,4])
  assert.equal(s.points.automa,44)
  const finished=checkAchievements(s,{end:true})
  assert.deepEqual(finished.botSpecial.completed,[1,4,5])
  assert.equal(finished.points.automa,68)
})

test('a city key resolves before the remaining discretionary science steps', () => {
  let s=createFirstGame({bonus:2})
  s.playerScience.law=7
  s.keys=1
  s.pending=[{kind:'science',left:3}]
  s=play(s,{kind:'science',discipline:'law'})
  assert.equal(s.pending[0].kind,'key')
  s=play(s,{kind:'key',accept:true})
  for (let i=0;i<2;i++) s=play(s,{kind:'science',discipline:'law'})
  assert.equal(s.playerScience.law,10)
  assert.equal(s.keys,0)
})

// Drive effects through the same suggestions used for buttons, including intermediate payments.
function settleTile(s) {
  for (let i=0;i<35 && (s.bookChoices || s.pending.length);i++) {
    const p=s.pending[0]
    let a
    if (s.bookChoices) a={kind:'choose-book',discipline:'banking'}
    else if (p.kind==='tower') a=choiceRows(s,'보드','A3').find(row=>row.enabled)?.action
    else if (p.kind==='spades') a={kind:'skip'}
    else a=choiceRows(s,'보드',null).find(row=>row.enabled)?.action
    assert.ok(a,JSON.stringify(p))
    s=play(s,a)
  }
  assert.equal(s.pending.length,0)
  assert.equal(s.bookChoices,0)
  return s
}

test('all base market tiles can be acquired and their choices completed', () => {
  for (const [kind,count] of [['innovation',18],['palace',17],['book',6],['competency',12]]) {
    for (let id=1;id<=count;id++) {
      let s=createFirstGame({bonus:2})
      s.resources.tools=30
      s.resources.books={banking:9,law:9,engineering:9,medicine:9}
      if (kind==='innovation') { s.deal.innovations=[id]; s.innovations.pool=[id] }
      if (kind==='book') s.deal.bookActions=[id]
      if (kind==='palace') { s.deal.palaces=[id]; s.pending=[{kind}] }
      if (kind==='competency') s.pending=[{kind}]
      s=settleTile(play(s,{kind,id}))
      if (kind==='innovation') assert.ok(s.innovations.player.includes(id))
      if (kind==='book') assert.ok(s.blocked.book.includes(id))
      if (kind==='palace') assert.equal(s.palace,id)
      if (kind==='competency') assert.ok(s.competencies.includes(id))
    }
  }
})

test('tile special actions are offered, take a turn and block reuse until the next round', () => {
  const s=createFirstGame({bonus:2})
  s.innovations.player=[3]
  const a=choiceRows(s,'파워·특수',null).find(r=>r.action.kind==='tile-action' && r.action.id===3)
  assert.ok(a?.enabled)
  const result=play(s,a.action)
  assert.equal(result.points.player,s.points.player+3)
  assert.equal(result.resources.scholars,s.resources.scholars+1)
  assert.equal(result.actionTaken,true)
  assert.throws(()=>play({...result,actionTaken:false},a.action),/이미 사용/)
})

test('Symbiont youth blocks construction and terraforming for the rest of the game', () => {
  const s=createFirstGame({bonus:2})
  s.automaFaction='symbionts'
  s.botSpecial=factionSetup(s)
  assert.equal(spadesBetween(s.botSpecial.youth,s.playerTerrain),2)
  assert.notEqual(s.botSpecial.youth,s.automaTerrain)
  const support={terrainPriority:'A',direction:'right-down',count:1}
  const first=placeTool(s,support).state
  const [hex]=first.botSpecial.tools
  const humans=s.buildings.filter(b=>b.owner==='player')
  assert.ok(openBuildHexes(s,humans,0).includes(hex))
  assert.ok(!openBuildHexes(first,humans,3).includes(hex))
  assert.throws(()=>terraformAndBuild(first,hex,3))
  const second=placeTool(first,support).state
  assert.equal(new Set(second.botSpecial.tools).size,2)
  assert.deepEqual(s.botSpecial.tools,[])
})

test('Blight converts the two nearest empty fallow hexes, using the card direction for ties', () => {
  const s=createFirstGame({bonus:2})
  s.automaFaction='blight'
  s.botSpecial=factionSetup(s)
  assert.deepEqual(s.botSpecial,{fallow:'forest',blighted:'plains'})
  const support={direction:'right-down',count:1}
  const next=spreadBlight(s,support).state
  const changed=Object.keys(next.terrainChanges)
  assert.equal(changed.length,2)
  assert.ok(changed.every(hex=>terrainAt(s,hex)==='forest' && terrainAt(next,hex)==='plains'))
  assert.deepEqual(s.buildings,next.buildings)
})

test('the engineering palace resolves its three rewards before a pending city reward', () => {
  let s=createFirstGame({bonus:2})
  s.deal.palaces=[15]
  s.pending=[{kind:'palace'},{kind:'city'},{kind:'science',left:3},{kind:'faction-book'}]
  s=play(s,{kind:'palace',id:15})
  const engineering=bonus=>({kind:'tile-choice',effect:'engineering',bonus})
  s=play(s,engineering('spades'))
  s=play(s,{kind:'skip'})
  s=play(s,engineering('books'))
  for (let i=0;i<2;i++) s=play(s,{kind:'choose-book',discipline:'banking'})
  s=play(s,engineering('bridges'))
  while (s.pending[0].kind==='tile-choice') {
    const available=choiceRows(s,'보드',null).find(row=>row.enabled)
    assert.ok(available)
    s=play(s,available.action)
  }
  assert.equal(s.pending[0].kind,'city')
  assert.equal(s.bookChoices,0)
})
