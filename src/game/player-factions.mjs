// Basic game, Appendix II. Starting science is applied before the first income.
export const playerFactionNames = {
  blessed: '축복족', felines: '고양이족', goblins: '고블린족', illusionists: '환술사',
  inventors: '발명가', lizards: '도마뱀족', moles: '두더지족', monks: '수도사',
  navigators: '항해사', omar: '오마르', philosophers: '철학자', psychics: '초능력자',
}

export const playerFactionDescriptions = {
  blessed: '각 과학 1칸으로 시작합니다. 라운드 종료 과학 보너스를 계산할 때 해당 분야의 레벨에 3을 더합니다.',
  felines: '은행학·의학 1칸으로 시작합니다. 도시를 세우면 과학 총 3칸과 원하는 책 1권을 받습니다.',
  goblins: '은행학·공학 1칸, 추가 도구 1개로 시작합니다. 삽을 사용할 때마다 코인 2개를 받습니다.',
  illusionists: '의학 2칸으로 시작합니다. 공용 파워 행동의 비용이 1 줄고 행동마다 3점을 받습니다.',
  inventors: '초기 배치 후 적성 타일 1개와 해당 칸의 과학·책 보상을 받습니다.',
  lizards: '원하는 과학 분야를 총 2칸 전진해 시작합니다. 도시를 세우면 삽 1개와 작업장 1개가 무료인 지형 변환·건설을 수행합니다.',
  moles: '공학 2칸으로 시작합니다. 도구 1개로 한 칸을 건너 굴을 파면 4점을 받습니다. 도구 1개로 육지 위에도 다리를 놓을 수 있습니다.',
  monks: '법학 1칸으로 시작합니다. 마지막에 대학 하나를 놓고 적성 타일과 해당 칸의 보상을 받습니다.',
  navigators: '법학 3칸으로 시작합니다. 강 옆에 작업장을 건설할 때마다 2점을 받습니다.',
  omar: '은행학·공학 1칸으로 시작합니다. 작업장 둘과 중립 탑 하나를 원하는 순서로 배치합니다. 매 수입마다 코인 2개와 파워 2를 받습니다.',
  philosophers: '은행학 2칸으로 시작합니다. 적성 타일을 얻을 때 같은 분야의 책 1권을 더 받습니다. 라운드마다 특수 행동으로 원하는 책 1권을 받습니다.',
  psychics: '은행학·의학 1칸, 추가 도구 1개로 시작합니다. 라운드마다 특수 행동으로 파워 5를 얻은 뒤 즉시 행동 하나를 수행합니다.',
}

export const startingScience = {
  blessed: { banking:1, law:1, engineering:1, medicine:1 }, felines: { banking:1, medicine:1 },
  goblins: { banking:1, engineering:1 }, illusionists: { medicine:2 }, inventors: {}, lizards: {},
  moles: { engineering:2 }, monks: { law:1 }, navigators: { law:3 },
  omar: { banking:1, engineering:1 }, philosophers: { banking:2 }, psychics: { banking:1, medicine:1 },
}

export function factionCityReward(state) {
  if (state.playerFaction === 'felines') {
    state.pending.push({kind:'science',left:3})
    state.pending.push({kind:'faction-book'})
  }
  if (state.playerFaction === 'lizards') state.pending.push({kind:'spades',left:1,freeWorkshop:true})
}

export function powerActionCost(state, printed) {
  return printed - Number(state.playerFaction === 'illusionists')
}
