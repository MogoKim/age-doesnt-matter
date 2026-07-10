import { describe, it, expect } from 'vitest'
import { pickNextGeoTopic } from '../../agents/magazine/geo-refill'
import type { LongtailKeyword } from '../../agents/magazine/longtail-keywords'

// D-mag(a) (2026-07-10): geo_seed lazy self-refill 선택기 검증.
// 배경: geo_seed 큐가 2026-05-02 이후 고갈 — trend-analyzer 중단 전 상시 큐 확보.
// 설계: docs/analysis/content-curate-dmag-geoseed-design-2026-07-10.md

const KW = (keyword: string, pillar?: string): LongtailKeyword => ({ keyword, intent: '질문형', pillar })
const POOL: Record<string, LongtailKeyword[]> = {
  건강: [KW('갱년기 불면 어떻게'), KW('무릎 통증 관리')],
  재테크: [KW('연금 수령 시기 비교')],
  관계: [KW('은퇴 후 외로움 극복')],
}

describe('pickNextGeoTopic — 기본 선택', () => {
  it('dayIndex 기반 카테고리 순환으로 선택한다', () => {
    const p0 = pickNextGeoTopic(POOL, new Set(), [], 0)
    const p1 = pickNextGeoTopic(POOL, new Set(), [], 1)
    const p2 = pickNextGeoTopic(POOL, new Set(), [], 2)
    expect(p0?.category).toBe('건강')
    expect(p1?.category).toBe('재테크')
    expect(p2?.category).toBe('관계')
  })

  it('dayIndex가 카테고리 수를 넘어도 순환한다 (음수 방어 포함)', () => {
    expect(pickNextGeoTopic(POOL, new Set(), [], 3)?.category).toBe('건강')
    expect(pickNextGeoTopic(POOL, new Set(), [], -1)?.category).toBe('관계')
  })

  it('선택 결과에 keyword/category/intent가 담긴다', () => {
    const p = pickNextGeoTopic(POOL, new Set(), [], 0)
    expect(p).toMatchObject({ keyword: '갱년기 불면 어떻게', category: '건강', intent: '질문형' })
  })
})

describe('pickNextGeoTopic — 중복 회피', () => {
  it('과거 geo_seed 제목(exact)과 겹치면 건너뛴다', () => {
    const p = pickNextGeoTopic(POOL, new Set(['갱년기 불면 어떻게']), [], 0)
    expect(p?.keyword).toBe('무릎 통증 관리')
  })

  it('최근 발행 매거진 제목에 키워드가 포함돼도 건너뛴다', () => {
    const p = pickNextGeoTopic(POOL, new Set(), ['[매거진] 갱년기 불면 어떻게 해결할까'], 0)
    expect(p?.keyword).toBe('무릎 통증 관리')
  })

  it('시작 카테고리가 전부 소진되면 다음 카테고리로 넘어간다', () => {
    const used = new Set(['갱년기 불면 어떻게', '무릎 통증 관리'])
    const p = pickNextGeoTopic(POOL, used, [], 0)
    expect(p?.category).toBe('재테크')
  })
})

describe('pickNextGeoTopic — 소진/경계', () => {
  it('전부 사용됐으면 null (호출부는 폴백으로 자연 강등)', () => {
    const used = new Set(['갱년기 불면 어떻게', '무릎 통증 관리', '연금 수령 시기 비교', '은퇴 후 외로움 극복'])
    expect(pickNextGeoTopic(POOL, used, [], 0)).toBeNull()
  })

  it('빈 풀이면 null', () => {
    expect(pickNextGeoTopic({}, new Set(), [], 0)).toBeNull()
  })
})
