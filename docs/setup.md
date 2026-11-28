# 1인 게임 초기 배치

기준은 기본판 영문 규칙서 v1.1과 오토마 영문 규칙서 v1.1이다. 1~3인 지도에서 사람 1명과 오토마 1명이 플레이한다. 일반 2인 게임에서 쓰는 가상 세력은 추가하지 않는다.

## 작은 보드

`src/game/small-board.mjs`는 육지 59칸, 강, 다리터 양 끝의 좌표, 지형별 초기 배치 문자 A~F를 정의한다. 좌표는 위에서 아래로 A~I행, 왼쪽에서 오른쪽으로 열 번호가 증가하며 B·D·F·H행은 오른쪽으로 반 칸 이동한다. 좌표의 행 이름과 카드에 인쇄된 배치 문자는 독립적이다. 예를 들어 사막의 초기 문자 A는 D3이다. 하나의 칸에 두 문자가 인쇄된 경우 둘 다 같은 칸을 가리킨다.

육지와 배치 문자는 로컬 `workshop-setup-1-3.webp`에서 옮겼다. 강과 17개 다리터는 기물이 없는 작은 보드와 별도 플레이 사진을 대조했다. 바깥 물길은 사진을 격자에 맞춰 첫 번째와 마지막 육지 주변까지 기록했다. 좌표 데이터의 다리터는 건설 가능한 양안이며 실제 건설한 다리는 빈 목록에서 시작한다. [초기 작업장 카드](https://github.com/brdgm/age-of-innovation-solo-helper/blob/bde1baec322d97b1fc022df1e34e03f7818c4521/src/assets/workshop-setup-1-3.webp) · [빈 보드 사진의 출처](https://misutmeeple.com/2025/04/resena-la-era-de-la-innovacion/) · [플레이 사진의 출처](https://www.comonox.com/entry/boardgames/open/age-innovation)

작업장 **초기 배치**는 오토마 규칙서 3쪽을 따른다. 결정 카드의 첫 번째 문자가 표시, 두 번째 문자가 미표시다. **게임 중 새 작업장**은 4·7쪽을 따른다. 배치 직전의 보드에서 새 칸부터 기존 표시 건물까지의 최소 거리와 기존 미표시 건물까지의 최소 거리를 비교한다. 전자가 엄격히 작을 때만 표식을 놓는다. 동거리는 미표시다. 이 거리에서 강과 오토마 건물을 통과할 수 있고 플레이어 건물은 돌아간다. 지원 카드의 건물 기호는 건설 후보를 찾을 때 사용한다. 건설 후보 계산과 거리 판정 예시는 [보드 판정 문서](board-rules.md)에 있다.

## 재현 가능한 세팅

Node.js 24에서 `npm test`로 검증한다. 브라우저에서도 같은 ES 모듈을 쓸 수 있다. `createSetupDeal`의 숫자 시드와 난이도로 공개 타일, 플레이어 선택지, 별도 초기 배치 카드, 행동 덱과 예비 덱 순서가 결정된다. 배열 첫 번째가 맨 위다. 실물 덱 순서를 지정하려면 `prepareDeck(difficulty, reserveOrder, playOrder)`에 1~14의 전체 순열을 각각 전달한다. 앞 순열은 예비 카드 추첨 순서, 뒤 순열은 시작 덱 셔플 순서다.

```js
import { createSetupDeal, placeStartingBuildings } from '../src/game/setup.mjs'

const deal = createSetupDeal({ seed: 42, difficulty: 'Automalein' })
const position = placeStartingBuildings(deal, {
  playerTerrain: 'mountain',
  playerFaction: 'navigators',
  playerBuildings: [{ hex: 'A2', building: 'workshop' }, { hex: 'A8', building: 'workshop' }],
  playerBonus: 3,
  automaTerrain: 'desert',
  automaFaction: 'simpletons',
})
```

이 예에서 첫 작업장 A2 다음에 오토마가 D3에 표시 작업장, E8에 미표시 작업장을 놓는다. 플레이어의 두 번째 작업장은 A8이다. 시작 덱은 위에서부터 5·6·4·2·1번이고 예비 덱 맨 위는 3번이다. 일반 초기 배치 외에 수도사(Monks)의 마지막 대학 배치와 오마르(Omar)의 중립 탑 순서 선택도 지원한다.

`decision-cards.json`은 14장의 행동·지원·패스·배치 정보를 담는다. 카드와 난이도, 오토마 초기 과학 값은 로컬 헬퍼의 `Cards.ts`, `DifficultyLevelParameters.ts`, `ScienceDisciplineBonuses.ts`를 대조했다. 점수 타일 ID는 헬퍼 에셋 번호를 따른다. 1~5라운드에 같은 과학 분야 타일 3장을 모두 놓을 수 없고, 삽 사용 타일은 5·6라운드에 놓을 수 없다. 마지막 덮개는 같은 건물 종류를 중복시킬 수 없다. 6라운드에는 기본 타일과 덮개의 플레이어 점수 조건을 둘 다 사용하고, 오토마 패스 점수와 과학 분야는 덮개 값을 사용한다. [결정 카드](https://github.com/brdgm/age-of-innovation-solo-helper/blob/bde1baec322d97b1fc022df1e34e03f7818c4521/src/services/Cards.ts) · [점수 타일 원화](https://github.com/brdgm/age-of-innovation-solo-helper/tree/bde1baec322d97b1fc022df1e34e03f7818c4521/src/assets/icons/round-score)

## 오토마 특수 종족

- **공생체족**은 초기 배치 직후 플레이어에게 삽 두 개가 드는 미사용 지형 우선순위 카드 한 장을 무작위로 정한다. 종족 건설 뒤 플레이어 건물과 직접 인접한 빈 육지 중 이 카드의 지형 순위, 지원 카드의 방향·순번을 적용해 도구를 놓는다. 도구는 그 칸의 건설과 변환을 막는다.
- **황폐족**의 휴경지는 플레이어에게 삽 하나가 드는 두 지형 중 오토마에게 더 먼 지형이다. 황폐지는 오토마에게 삽 하나가 드는 두 지형 중 플레이어에게 더 먼 지형이다. 종족 행동 때 작업장 건설을 처리하고, 플레이어 건물에 가까운 빈 휴경지를 황폐지로 두 번 바꾼다. 동률이면 지원 카드의 방향·순번을 따른다.
- **고그놈족**은 업적 여섯 개 중 세 개를 뽑는다. 선택된 업적을 달성할 때마다 즉시 순서대로 8점, 16점, 24점을 받는다. 건물에서 파워를 3 이상 제안하는 업적은 플레이어의 수락 여부와 독립적이다. 점수 차이 업적은 라운드 종료 시 확인한다.

세 종족의 인쇄된 영문 카드와 업적 조건을 대조했다. [종족 카드 원본 사진](https://www.reddit.com/r/soloboardgaming/comments/1aujnea/comment/krkt6yl/) · [업적 카드 원본 사진](https://www.reddit.com/r/soloboardgaming/comments/1aujnea/comment/krkt7za/)

## 보드와 구성물 이미지

`public/boards/terrain-atlas.webp`는 헬퍼의 원본 지형 타일 일곱 장에서 잘라낸 지형과 짙은 강 색을 담는다. `npm run render:board`는 이 파일과 보드 좌표로 지도 PNG를 다시 그린다.

`public/components/`의 항해, 과학 분야, 종족, 지형, 혁신, 궁전, 적성, 라운드 보너스·득점, 책 행동 이미지는 [오토마 헬퍼의 원본 자산](https://github.com/brdgm/age-of-innovation-solo-helper/tree/bde1baec322d97b1fc022df1e34e03f7818c4521/src/assets)에서 가져왔다. 과학 판면과 책은 영문 기본 규칙서 2쪽, 나무 기물과 자원은 3쪽, 도시 타일과 파워 행동은 23쪽의 구성물 그림을 사용한다.

삽당 도구 1·2·3개 도안은 [공식 영문 규칙서 11쪽](https://www.feuerland-spiele.de/fileadmin/game/Age_of_Innovation/Age_of_Innovation_rules_EN_V1-1_low.pdf#page=11)의 지형 변환 트랙에서 각 비용 칸을 잘라 사용한다.

열쇠 아이콘은 기본 규칙서 2쪽의 도시 타일 뒷면에서 가져왔다. 공용 행동을 닫는 X토큰은 3쪽 구성물 그림을 사용하며, 2인용 혁신·적성 판면과 책 행동판은 헬퍼의 원본 이미지다.

개인 보드의 나뭇결과 파워 그릇 세 개는 기본 규칙서 2쪽의 계획판에서, 플레이어 종족 그림 12종은 20쪽의 종족 타일에서 가져왔다.
