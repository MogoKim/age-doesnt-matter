import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  keywordCore,
  brandFitExclusion,
  applyFailurePolicy,
  type QueueState,
} from '../../agents/magazine/keyword-queue'

/** PR-1 forward safety — 순수 함수 계약 고정. DB/발행 없이 검증. */

describe('normalizeText / keywordCore — 띄어쓰기 무관 subtopic 매칭', () => {
  it('공백·문장부호 제거', () => {
    expect(normalizeText('빈 둥지 증후군, 증상과 극복법')).toBe('빈둥지증후군증상과극복법')
    expect(normalizeText('갱년기 다이어트 식단, 이렇게')).toBe('갱년기다이어트식단이렇게')
  })
  it('keywordCore = 앞 2토큰 공백 제거', () => {
    expect(keywordCore('빈둥지 증후군 해결')).toBe('빈둥지증후군')
    expect(keywordCore('갱년기 다이어트 방법')).toBe('갱년기다이어트')
  })
  it('띄어쓰기 다른 발행 제목에 keywordCore가 부분문자열로 매칭된다 (DB 가드 핵심)', () => {
    const published = normalizeText('빈 둥지 증후군, 증상과 극복법')
    expect(published.includes(keywordCore('빈둥지 증후군 해결'))).toBe(true)
    const published2 = normalizeText('갱년기 다이어트 식단, 이렇게')
    expect(published2.includes(keywordCore('갱년기 다이어트 방법'))).toBe(true)
  })

  // [case-fix 2026-07-21] 영문 약어 대소문자 near-dup — canary IRP 사고 회귀 방지.
  //   autocomplete 키워드는 소문자(irp/etf/isa), 발행 제목은 대문자(IRP/ETF/ISA) → 대소문자 무관 매칭 필수.
  it('영문 약어 대소문자 무관 매칭 — 소문자 키워드 vs 대문자 제목', () => {
    // 사고 재현: "퇴직금 irp" 키워드가 기존 "퇴직금 IRP..." 매거진에 매칭돼야 함
    expect(normalizeText('퇴직금 IRP, 세금 얼마나 아낄까').includes(keywordCore('퇴직금 irp 이유'))).toBe(true)
    // ETF/ISA도 동일
    expect(normalizeText('50대 ETF 왕초보 가이드').includes(keywordCore('50대 etf 투자'))).toBe(true)
    expect(normalizeText('ISA 계좌 완벽 정리').includes(keywordCore('isa 계좌'))).toBe(true)
    // 역방향(대문자 키워드 vs 소문자 제목)도 무관
    expect(normalizeText('연금저축 irp 비교').includes(keywordCore('연금저축 IRP'))).toBe(true)
  })
  it('normalizeText는 영문을 소문자로 폴딩(한글은 대소문자 없음)', () => {
    expect(normalizeText('IRP')).toBe('irp')
    expect(normalizeText('퇴직금 IRP')).toBe('퇴직금irp')
    expect(normalizeText('갱년기 증상')).toBe('갱년기증상') // 한글 정규화 기존 동작 유지
  })
})

describe('brandFitExclusion — 보수적 제외', () => {
  it('남성 중심 제외 (남편은 통과)', () => {
    expect(brandFitExclusion('갱년기 나이 남자')).toBe('male_centric')
    expect(brandFitExclusion('50대 남편 패션')).toBeNull() // 남편=on-target
  })
  it('과도 broad 제외', () => {
    expect(brandFitExclusion('50대 커뮤니티')).toBe('broad_community')
    expect(brandFitExclusion('커뮤니티별 나이대')).toBe('broad_community')
    expect(brandFitExclusion('60대 여성 건강')).toBe('broad_health')
    expect(brandFitExclusion('50대 여성 건강')).toBe('broad_health')
  })
  it('정상 검색형은 통과 (과차단 방지)', () => {
    expect(brandFitExclusion('갱년기 영양제 추천')).toBeNull()
    expect(brandFitExclusion('60대 갱년기 언제 끝나나요')).toBeNull()
    expect(brandFitExclusion('퇴직금 irp 해지 방법')).toBeNull()
  })
})

describe('applyFailurePolicy — 소비/재시도', () => {
  const mk = (): QueueState => ({
    version: 1, updatedAt: '', consumedNormalized: [],
    counts: { published: 0, skipped_duplicate: 0, failed_generation: 0, failed_image: 0, failed_body_short: 0, failed_no_publish_guard: 0 },
    events: [], retryCount: {},
  })
  it('성공·중복·no_publish는 즉시 소비', () => {
    expect(applyFailurePolicy(mk(), 'x', 'published')).toBe(true)
    expect(applyFailurePolicy(mk(), 'x', 'skipped_duplicate')).toBe(true)
    expect(applyFailurePolicy(mk(), 'x', 'failed_no_publish_guard')).toBe(true)
  })
  it('이미지 실패는 소비 안 함(다음 회차 재시도)', () => {
    expect(applyFailurePolicy(mk(), 'x', 'failed_image')).toBe(false)
  })
  it('생성/본문 실패는 1회 재시도 후 소비 (무한루프 없음)', () => {
    const s = mk()
    expect(applyFailurePolicy(s, 'k', 'failed_generation')).toBe(false) // 1회차 = 재시도
    expect(applyFailurePolicy(s, 'k', 'failed_generation')).toBe(true) // 2회차 = 소비
    expect(s.retryCount?.k).toBe(2)
    const s2 = mk()
    expect(applyFailurePolicy(s2, 'k', 'failed_body_short')).toBe(false)
    expect(applyFailurePolicy(s2, 'k', 'failed_body_short')).toBe(true)
  })
})
