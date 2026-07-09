import { describe, it, expect } from 'vitest'
import { findPoliticalKeyword, hasPoliticalKeyword } from '../../agents/core/political-blocklist'

// Phase 0-a (2026-07-09): '사드'·'대선' bare substring 오탐 교정 검증.
// 실측 근거: 7일 production CafePost 정치 매칭 19건 중 '사드' 13건이 전부
// "감사드려요/사드릴까" 오탐 (docs/analysis/content-curate-asis-audit-2026-07-09.md §3-4)

describe('political-blocklist — 오탐 교정 (통과해야 하는 일상어)', () => {
  it.each([
    '감사드려요',
    '미리 감사드립니다! ^^',
    '가입 첫글 인사드려요 55세',
    '부모님 맛난거 사드릴까 생각합니다',
    '어머니께 옷 사드렸어요',
    '아버지 보약 사드리려고요',
    '인근에서 깍깍대선 까치와 까마귀',  // '대선' 오탐 실측 사례
  ])('통과: %s', (text) => {
    expect(hasPoliticalKeyword(text, '')).toBe(false)
    expect(hasPoliticalKeyword('', text)).toBe(false)
  })
})

describe('political-blocklist — 정치 문맥은 계속 차단', () => {
  it.each([
    '사드 배치',
    '사드 문제',
    '사드 철회',
    '사드 찬반',
    '사드배치 반대합니다',   // 무공백 복합어
    '사드를 배치하면 어떻게 되나요',
    '이번 대선 후보가 궁금해요',
    '대선후보 토론회 봤어요',
  ])('차단: %s', (text) => {
    expect(hasPoliticalKeyword(text, '')).toBe(true)
  })

  it.each(['이재명', '한동훈', '윤석열', '민주당', '국민의힘', '이명박', '탄핵', '총선'])(
    '기존 키워드 회귀: %s',
    (kw) => {
      expect(findPoliticalKeyword(`${kw} 관련 이야기`, '')).toEqual({ keyword: kw, field: 'title' })
      expect(hasPoliticalKeyword('', `본문에 ${kw} 언급`)).toBe(true)
    },
  )

  it('title 우선 매칭 유지', () => {
    expect(findPoliticalKeyword('민주당 이야기', '국민의힘 이야기')).toEqual({ keyword: '민주당', field: 'title' })
  })

  it('content 매칭 field=content', () => {
    expect(findPoliticalKeyword('평범한 제목', '본문에 사드 배치 언급')).toEqual({ keyword: '사드', field: 'content' })
  })
})
