import { describe, it, expect } from 'vitest'
import { buildDailyQuarantine, extractBlockedRefIds, type QuarantineEntry } from '../../agents/cafe/curator-quarantine'

// Phase 0-b/c (2026-07-09): DUPLICATE_TITLE(기존 P0-A) + POLITICAL_BLOCK(신규) 당일 격리를
// topic/cafePostId/refCafePostId 3키로 계산하는 순수 함수 검증.
// 실측 근거: 이명박 정치 후보 당일 9~12회 반복 재시도 (docs/analysis/content-curate-asis-audit-2026-07-09.md)

const dup = (over: Partial<QuarantineEntry> = {}): QuarantineEntry =>
  ({ skipReason: 'DUPLICATE_TITLE', topic: '중복 토픽', cafePostId: 'dup-cafe-1', ...over })
const pol = (over: Partial<QuarantineEntry> = {}): QuarantineEntry =>
  ({ skipReason: 'POLITICAL_BLOCK', topic: '정치 토픽', cafePostId: 'pol-cafe-1', ...over })

describe('buildDailyQuarantine — 기존 DUPLICATE_TITLE 격리 유지', () => {
  it('topic과 cafePostId를 격리한다 (P0-A 동작 승계)', () => {
    const q = buildDailyQuarantine([[dup()]])
    expect(q.dup.topics.has('중복 토픽')).toBe(true)
    expect(q.dup.cafeIds.has('dup-cafe-1')).toBe(true)
  })

  it('threshold 미만이면 격리하지 않는다', () => {
    const q = buildDailyQuarantine([[dup()]], 2)
    expect(q.dup.topics.size).toBe(0)
    expect(q.dup.cafeIds.size).toBe(0)
  })

  it('threshold=2에서 2회 발생하면 격리한다', () => {
    const q = buildDailyQuarantine([[dup()], [dup()]], 2)
    expect(q.dup.cafeIds.has('dup-cafe-1')).toBe(true)
  })
})

describe('buildDailyQuarantine — POLITICAL_BLOCK 신규 격리', () => {
  it('topic과 cafePostId를 격리한다', () => {
    const q = buildDailyQuarantine([[pol()]])
    expect(q.political.topics.has('정치 토픽')).toBe(true)
    expect(q.political.cafeIds.has('pol-cafe-1')).toBe(true)
  })

  it('DUP와 POLITICAL을 버킷별로 분리 집계한다', () => {
    const q = buildDailyQuarantine([[dup(), pol()]])
    expect(q.dup.topics.has('정치 토픽')).toBe(false)
    expect(q.political.topics.has('중복 토픽')).toBe(false)
  })
})

describe('buildDailyQuarantine — refCafePostId 격리 (Phase 0-b 필드)', () => {
  it('refCafePostId가 있으면 refIds로 격리한다', () => {
    const q = buildDailyQuarantine([[pol({ refCafePostId: 'ref-9' }), dup({ refCafePostId: 'ref-8' })]])
    expect(q.political.refIds.has('ref-9')).toBe(true)
    expect(q.dup.refIds.has('ref-8')).toBe(true)
  })

  it('과거 로그(ref 필드 없음)에서도 오류 없이 동작한다 — refIds만 비어 있음', () => {
    const legacy: QuarantineEntry[] = [
      { skipReason: 'POLITICAL_BLOCK', topic: '옛 로그', cafePostId: 'old-1' },
      { skipReason: 'DUPLICATE_TITLE', topic: '옛 중복' },
    ]
    const q = buildDailyQuarantine([legacy])
    expect(q.political.cafeIds.has('old-1')).toBe(true)
    expect(q.political.refIds.size).toBe(0)
    expect(q.dup.topics.has('옛 중복')).toBe(true)
    expect(q.dup.cafeIds.size).toBe(0)
  })
})

describe('buildDailyQuarantine — 안전성/경계', () => {
  it('다른 skipReason(LOW_USABLE 등)·발행 성공(null)은 격리하지 않는다', () => {
    const q = buildDailyQuarantine([[
      { skipReason: 'LOW_USABLE_COMMENTS', topic: 'a', cafePostId: 'c1' },
      { skipReason: 'REFS_EMPTY', topic: 'b' },
      { skipReason: null, topic: 'published', cafePostId: 'c2', refCafePostId: 'r2' },
      { topic: 'no-reason' },
    ]])
    expect(q.dup.topics.size + q.dup.cafeIds.size + q.dup.refIds.size).toBe(0)
    expect(q.political.topics.size + q.political.cafeIds.size + q.political.refIds.size).toBe(0)
  })

  it('빈 입력·비배열 회차에도 안전하다', () => {
    expect(() => buildDailyQuarantine([])).not.toThrow()
    expect(() => buildDailyQuarantine([undefined as unknown as QuarantineEntry[], [pol()]])).not.toThrow()
    const q = buildDailyQuarantine([undefined as unknown as QuarantineEntry[], [pol()]])
    expect(q.political.cafeIds.has('pol-cafe-1')).toBe(true)
  })

  it('여러 회차에 걸친 누적 집계가 된다 (당일 BotLog 전체 기준)', () => {
    const q = buildDailyQuarantine([[pol({ cafePostId: 'p1' })], [pol({ cafePostId: 'p2' })], [dup({ cafePostId: 'd1' })]])
    expect(q.political.cafeIds.has('p1')).toBe(true)
    expect(q.political.cafeIds.has('p2')).toBe(true)
    expect(q.dup.cafeIds.has('d1')).toBe(true)
  })
})

describe('extractBlockedRefIds — HAIKU_BLOCKED 재선정 루프 hotfix (2026-07-18)', () => {
  it('BLOCKED logData에서 cafePostId 추출', () => {
    const ids = extractBlockedRefIds([
      { cafePostId: 'ref-a', title: '학폭' },
      { cafePostId: 'ref-b', title: '유부남' },
      { cafePostId: 'ref-a' }, // 중복은 Set으로 수렴
    ])
    expect(ids).toEqual(new Set(['ref-a', 'ref-b']))
  })
  it('불량 logData(null·필드 없음·비문자열·빈 문자열)는 조용히 무시 — 발행 흐름 무영향', () => {
    const ids = extractBlockedRefIds([null, undefined, 'str', 42, {}, { cafePostId: null }, { cafePostId: 7 }, { cafePostId: '' }, { cafePostId: 'ok' }])
    expect(ids).toEqual(new Set(['ok']))
  })
  it('union 시 BLOCKED id가 격리 세트에 포함되는 계약 (기존 DUP/POL 흐름과 합류)', () => {
    const blocked = extractBlockedRefIds([{ cafePostId: 'blk-1' }])
    const merged = new Set(['dup-1', 'pol-1', ...blocked])
    expect(merged.has('blk-1')).toBe(true)
    expect(merged.has('dup-1')).toBe(true)
  })
})
