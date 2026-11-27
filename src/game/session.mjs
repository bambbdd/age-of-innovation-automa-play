import { actionDescription, createGame, firstDeal, play } from './first-game.mjs'
import { createSetupDeal } from './setup.mjs'

export const saveKey = 'age-of-innovation.solo.v1'
export class SaveConflict extends Error {}

export function sessionDeal(seed,difficulty,market) {
  const deal = createSetupDeal({seed,difficulty})
  if (market === 'standard') return deal
  if (market !== 'starter' || seed !== 42) throw new Error('대국 배분 방식을 확인하세요.')
  return {...firstDeal(),difficulty,deck:deal.deck}
}

export function startSession(deal,market,selection) {
  const {playerFaction,playerTerrain,automaFaction,automaTerrain,playerBonus,playerBuildings} = selection
  const setup = {playerFaction,playerTerrain,automaFaction,automaTerrain,playerBonus,playerBuildings}
  return {state:createGame(deal,setup), record:{version:1,seed:deal.seed,difficulty:deal.difficulty,
    market,setup,actions:[]}}
}

// Only successful commands enter the journal. It also preserves unfinished choices within a turn.
export function sessionAction(session,action) {
  const state = play(session.state,action)
  return {state,record:{...session.record,actions:[...session.record.actions,action]}}
}

function needsChoice(state) {
  return state.bookChoices > 0 || state.pending.length > 0
}

// The committed session stays at the checkpoint until the whole turn is accepted.
export function stagePlayerAction(committed, draft, action) {
  if (draft?.ready || action.kind==='automa') throw new Error('플레이어 차례를 먼저 확정하세요.')
  const current = draft?.next ?? committed
  const next = sessionAction(current,action)
  // Setup, income and responses to an Automa action may start at their own checkpoint.
  const effectsOnly = draft?.effectsOnly ?? (needsChoice(current.state) && !current.state.actionTaken)
  const closing = effectsOnly || draft?.closing===true || ['end-turn','pass'].includes(action.kind)
  const ready = closing && (!needsChoice(next.state) || next.state.round !== committed.state.round)
  return {next,effectsOnly,closing,ready,
    labels:[...(draft?.labels ?? []),actionDescription(action,current.state)]}
}

export function resumeSession(raw) {
  const record = JSON.parse(raw)
  if (record?.version !== 1 || !Array.isArray(record.actions)) throw new Error('읽을 수 없는 저장 형식입니다.')
  const deal = sessionDeal(record.seed,record.difficulty,record.market)
  let state = createGame(deal,record.setup)
  for (const action of record.actions) state = play(state,action,{replayPlacedNeutral:true})
  return {state,record}
}

// Caller holds the origin's save lock where the browser supports Web Locks.
export function writeSession(storage,previous,record) {
  if (storage.getItem(saveKey)!==previous) throw new SaveConflict('다른 탭의 대국이 저장되었습니다. 저장한 대국을 다시 열어 주세요.')
  const raw=JSON.stringify(record)
  storage.setItem(saveKey,raw)
  return raw
}
