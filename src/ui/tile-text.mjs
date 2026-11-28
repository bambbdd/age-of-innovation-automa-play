import { palaceRewards } from '../game/first-game-tiles.mjs'

export const incomeNames={tools:'도구',coins:'코인',scholars:'학자',power:'파워 충전',points:'승점',books:'자유 책',scienceChoice:'과학 전진'}
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

export function incomeText(income) {
  return Object.entries(income).filter(([,n])=>n).map(([k,n])=>incomeNames[k]+' '+n).join(' · ')
}

export function palaceInfo(id) {
  const {name,income}=palaceRewards[id]
  return {name:name.split(' · ')[0],effect:palaceEffects[id],income:income ? '수입 · '+incomeText(income) : ''}
}
