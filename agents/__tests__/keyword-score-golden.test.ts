import { describe, expect, it } from 'vitest'

import {
  computeScore,
  DEFAULT_SCORE_PARAMS,
  evaluateSensitivity,
  inferCluster,
  type KeywordNode,
} from '../magazine/keyword-research/scorer.js'

/**
 * 매거진 키워드 점수 — golden test.
 *
 * GSC dead-path(`gsc-nearmiss.ts` · `nearmiss-gate.ts` · 미사용 스냅샷)를 지우면서
 * **살아 있는 노드의 점수가 단 하나도 바뀌지 않았음**을 고정한다.
 *
 * 오늘 universe 의 모든 노드는 `gsc: null` 이다 — `run-full-collect.ts` 가
 * `node.gsc` 를 채우지 않는다. `gscSignalScore(null)` 은 0 이므로 점수식의
 * `0.25 · gscSignal` 항은 상수 0 이고, 죽은 경로를 지워도 산술 결과가 같다.
 *
 * ⚠️ 아래 기대값은 **삭제 이전 코드로 실행해 얻은 숫자를 그대로 박은 것**이다.
 *    `computeScore` 로 다시 계산해 비교하면 공식이 바뀌어도 테스트가 따라 움직여
 *    아무것도 지키지 못한다. 숫자를 손으로 고쳐야만 통과하도록 둔다.
 *
 * 점수 공식·가중치·DEFAULT_SCORE_PARAMS 를 바꾸면 여기가 먼저 깨진다. 그건 의도다 —
 * 점수 정규화는 별도 정책 작업이며 이 PR 의 범위가 아니다.
 */

/** 기대값 산출 당시의 입력. cluster·sensitivity·depth·demandSignal 을 골고루 흩었다. */
const FIXTURES = [
  { keyword: '갱년기 증상', demandSignal: 48, depth: 0 },
  { keyword: '갱년기 불면증 해결', demandSignal: 12, depth: 2 },
  { keyword: '50대 여성 운동', demandSignal: 30, depth: 1 },
  { keyword: '중년 재취업 방법', demandSignal: 7, depth: 3 },
  { keyword: '폐경 후 관리', demandSignal: 21, depth: 1 },
  { keyword: '노후 자금 계산', demandSignal: 3, depth: 2 },
  { keyword: '갱년기 우울증', demandSignal: 15, depth: 1 },
  { keyword: '부부관계 고민', demandSignal: 5, depth: 2 },
] as const

/** 삭제 이전 코드가 낸 값 — 하드코딩. 동적 계산 금지. */
const GOLDEN_SCORES: Record<string, number> = {
  '갱년기 증상': 0.747,
  '갱년기 불면증 해결': 0.546,
  '50대 여성 운동': 0.517,
  '중년 재취업 방법': 0.496,
  '폐경 후 관리': 0.611,
  '노후 자금 계산': 0.336,
  '갱년기 우울증': 0.587,
  '부부관계 고민': 0.217,
}

/** 삭제 이전 코드의 정렬 순서(점수 내림차순, 동점이면 키워드 오름차순) — 하드코딩. */
const GOLDEN_ORDER = [
  '갱년기 증상',
  '폐경 후 관리',
  '갱년기 우울증',
  '갱년기 불면증 해결',
  '50대 여성 운동',
  '중년 재취업 방법',
  '노후 자금 계산',
  '부부관계 고민',
] as const

/** 분류가 바뀌면 점수도 바뀐다 — 입력 쪽 고정값도 함께 박는다. */
const GOLDEN_CLASSIFICATION: Record<string, { cluster: string; sensitivity: string }> = {
  '갱년기 증상': { cluster: '갱년기건강', sensitivity: 'none' },
  '갱년기 불면증 해결': { cluster: '갱년기건강', sensitivity: 'none' },
  '50대 여성 운동': { cluster: 'uncategorized', sensitivity: 'none' },
  '중년 재취업 방법': { cluster: '일자리', sensitivity: 'none' },
  '폐경 후 관리': { cluster: '갱년기건강', sensitivity: 'none' },
  '노후 자금 계산': { cluster: '돈연금', sensitivity: 'none' },
  '갱년기 우울증': { cluster: '갱년기건강', sensitivity: 'none' },
  '부부관계 고민': { cluster: '부부성건강', sensitivity: 'medium' },
}

function buildNode(f: (typeof FIXTURES)[number]): Pick<
  KeywordNode,
  'demandSignal' | 'depth' | 'gsc' | 'keyword' | 'cluster' | 'sensitivity'
> {
  return {
    keyword: f.keyword,
    demandSignal: f.demandSignal,
    depth: f.depth,
    cluster: inferCluster(f.keyword),
    sensitivity: evaluateSensitivity(f.keyword),
    gsc: null,
  }
}

describe('gsc:null 노드의 점수는 GSC 경로 제거 전후로 동일하다', () => {
  it('노드별 점수가 기대값과 정확히 일치한다', () => {
    const actual: Record<string, number> = {}
    for (const f of FIXTURES) actual[f.keyword] = computeScore(buildNode(f), DEFAULT_SCORE_PARAMS)
    expect(actual).toEqual(GOLDEN_SCORES)
  })

  it('점수 내림차순 정렬 순서가 기대값과 정확히 일치한다', () => {
    const order = FIXTURES.map((f) => ({ keyword: f.keyword, score: computeScore(buildNode(f), DEFAULT_SCORE_PARAMS) }))
      .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword))
      .map((s) => s.keyword)
    expect(order).toEqual([...GOLDEN_ORDER])
  })

  it('cluster·sensitivity 분류도 기대값과 일치한다', () => {
    const actual: Record<string, { cluster: string; sensitivity: string }> = {}
    for (const f of FIXTURES) {
      actual[f.keyword] = { cluster: inferCluster(f.keyword), sensitivity: evaluateSensitivity(f.keyword) }
    }
    expect(actual).toEqual(GOLDEN_CLASSIFICATION)
  })

  it('DEFAULT_SCORE_PARAMS 가 기대값 산출 당시와 같다', () => {
    // 파라미터가 바뀌면 위 숫자는 더 이상 같은 의미가 아니다.
    expect(DEFAULT_SCORE_PARAMS).toEqual({ freqCap: 50, ugcPenetration: 0 })
  })

  it('gsc 항은 null 에서 점수에 기여하지 않는다', () => {
    // 이게 성립해야 "GSC 경로를 지워도 점수가 같다"는 주장이 성립한다.
    const withNull = computeScore(buildNode(FIXTURES[0]), DEFAULT_SCORE_PARAMS)
    expect(withNull).toBe(GOLDEN_SCORES[FIXTURES[0].keyword])
  })
})
