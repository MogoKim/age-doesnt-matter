/**
 * 회원 소생 계산 단위 계약 — Foundation 3.0 (C-1).
 *
 * ── 왜 나눴나 ────────────────────────────────────────────────
 *  `admin.member-recovery.ts` 는 939줄이었고, 그중 556줄이 함수 하나였다.
 *  크기가 문제가 아니라 **검증 가능성**이 문제였다 — 기간 경계 하나를 확인하려면
 *  퍼널 전체를 돌려야 했다. 타입(화면 계약)과 계산 단위를 떼어내
 *  DB mock 만으로 경계와 결과를 대조할 수 있게 했다.
 *
 *  기존 import 경로는 그대로 쓸 수 있다 — 본체가 전부 재수출한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const groupBy = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { groupBy: (...a: unknown[]) => groupBy('post', ...a) },
    comment: { groupBy: (...a: unknown[]) => groupBy('comment', ...a) },
    eventLog: { groupBy: (...a: unknown[]) => groupBy('eventLog', ...a) },
  },
}))
const getRetentionQuadrants = vi.fn()
vi.mock('@/lib/queries/admin/admin.retention', () => ({
  getRetentionQuadrants: () => getRetentionQuadrants(),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

import type { VisitorSpan as OldVisitorSpan } from '@/lib/queries/admin/admin.member-recovery'
import type { VisitorSpan as NewVisitorSpan } from '@/lib/queries/admin/admin.member-recovery.compute'
import {
  DAY, HOUR, isRealProviderId, rateOf, median,
  addSpan, advancedAfter, unionSpans, computeActivation, computeRetentionView,
  type SpanMap,
} from '@/lib/queries/admin/admin.member-recovery.compute'

beforeEach(() => {
  groupBy.mockReset()
  getRetentionQuadrants.mockReset()
})

describe('기간 상수', () => {
  it('DAY 와 HOUR 가 밀리초 기준이다', () => {
    expect(DAY).toBe(86400000)
    expect(HOUR).toBe(3600000)
    expect(DAY / HOUR).toBe(24)
  })
})

describe('rateOf — 분모 0 은 0% 가 아니라 null', () => {
  it.each([
    [1, 2, 50],
    [1, 3, 33.3],
    [2, 3, 66.7],
    [0, 5, 0],
    [5, 5, 100],
  ])('rateOf(%i, %i) → %p', (n, d, expected) => {
    expect(rateOf(n, d)).toBe(expected)
  })

  it('🔴 분모가 0 이면 null — "0%" 와 "잴 수 없음" 을 같은 칸에 넣지 않는다', () => {
    expect(rateOf(0, 0)).toBeNull()
    expect(rateOf(3, 0)).toBeNull()
    expect(rateOf(0, -1)).toBeNull()
  })

  it('소수 첫째 자리까지 반올림한다', () => {
    expect(rateOf(1, 7)).toBe(14.3)
    expect(rateOf(2, 7)).toBe(28.6)
  })
})

describe('median', () => {
  it.each([
    [[], null],
    [[5], 5],
    [[1, 3], 2],
    [[3, 1], 2],
    [[5, 1, 3], 3],
    [[4, 1, 3, 2], 2.5],
  ])('median(%j) → %p', (vals, expected) => {
    expect(median(vals as number[])).toBe(expected)
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const src = [3, 1, 2]
    median(src)
    expect(src).toEqual([3, 1, 2])
  })
})

describe('isRealProviderId', () => {
  it.each([['1', true], ['12345', true], ['', false], [null, false], [undefined, false],
           ['seed_1', false], ['curator-2', false], ['1a', false]])(
    '%p → %p', (pid, expected) => {
      expect(isRealProviderId(pid as string | null | undefined)).toBe(expected)
    })
})

describe('방문 구간(span) 합치기', () => {
  it('addSpan 은 최초를 앞으로, 최종을 뒤로 넓힌다', () => {
    const m: SpanMap = new Map()
    addSpan(m, 's1', 100, 200)
    addSpan(m, 's1', 50, 150)
    addSpan(m, 's1', 120, 300)
    expect(m.get('s1')).toEqual({ first: 50, last: 300 })
  })

  it('unionSpans 는 여러 맵을 하나로 합친다', () => {
    const a: SpanMap = new Map([['s1', { first: 10, last: 20 }]])
    const b: SpanMap = new Map([['s1', { first: 5, last: 30 }], ['s2', { first: 1, last: 2 }]])
    const u = unionSpans(a, b)
    expect(u.get('s1')).toEqual({ first: 5, last: 30 })
    expect(u.get('s2')).toEqual({ first: 1, last: 2 })
    expect(a.get('s1')).toEqual({ first: 10, last: 20 })   // 원본 불변
  })

  it('🔴 advancedAfter 는 순서를 본다 — 나중에 일어난 것만 전환으로 센다', () => {
    const from: SpanMap = new Map([
      ['ok', { first: 100, last: 100 }],
      ['before', { first: 500, last: 500 }],
      ['none', { first: 100, last: 100 }],
    ])
    const to: SpanMap = new Map([
      ['ok', { first: 200, last: 200 }],       // from 이후 → 전환
      ['before', { first: 200, last: 200 }],   // from 이전 → 전환 아님
      ['stranger', { first: 300, last: 300 }], // from 에 없음 → 전환 아님
    ])
    expect(advancedAfter(from, to)).toBe(1)
  })

  it('단순 교집합이었다면 2 였을 것 — 순서를 무시하면 과대계상된다', () => {
    const from: SpanMap = new Map([['a', { first: 100, last: 100 }], ['b', { first: 500, last: 500 }]])
    const to: SpanMap = new Map([['a', { first: 200, last: 200 }], ['b', { first: 200, last: 200 }]])
    const intersection = [...to.keys()].filter((k) => from.has(k)).length
    expect(intersection).toBe(2)
    expect(advancedAfter(from, to)).toBe(1)
  })
})

describe('🔴 2단계 활성화 — 24시간 경계가 곧 의미다', () => {
  const NOW = new Date('2026-09-16T00:00:00Z').getTime()
  const joined = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR)

  function mockFirsts(posts: Array<[string, number]>, comments: Array<[string, number]>) {
    groupBy.mockImplementation((model: string) => {
      if (model === 'post') return Promise.resolve(posts.map(([authorId, t]) => ({ authorId, _min: { createdAt: new Date(t) } })))
      if (model === 'comment') return Promise.resolve(comments.map(([authorId, t]) => ({ authorId, _min: { createdAt: new Date(t) } })))
      return Promise.resolve([])
    })
  }

  it('가입 24시간 미만 회원은 분모에서 빼고 immature 로 센다', async () => {
    mockFirsts([], [])
    const r = await computeActivation(
      [{ id: 'u1', createdAt: joined(1) }, { id: 'u2', createdAt: joined(48) }],
      NOW,
    )
    expect(r.cohortTotal).toBe(2)
    expect(r.immature).toBe(1)
    expect(r.matureDenom).toBe(1)
  })

  it('정확히 24시간에 쓴 글은 성공이다 (경계 포함)', async () => {
    const u = { id: 'u1', createdAt: joined(48) }
    mockFirsts([['u1', u.createdAt.getTime() + DAY]], [])
    const r = await computeActivation([u], NOW)
    expect(r.wrotePostWithin24h).toBe(1)
    expect(r.wroteAnyWithin24h).toBe(1)
    expect(r.wroteAnyLater).toBe(0)
  })

  it('24시간 + 1ms 는 실패로 세고 wroteAnyLater 로 넘어간다', async () => {
    const u = { id: 'u1', createdAt: joined(72) }
    mockFirsts([['u1', u.createdAt.getTime() + DAY + 1]], [])
    const r = await computeActivation([u], NOW)
    expect(r.wrotePostWithin24h).toBe(0)
    expect(r.wroteAnyWithin24h).toBe(0)
    expect(r.wroteAnyLater).toBe(1)
  })

  it('글과 댓글을 각각 세고, 둘 중 빠른 쪽으로 첫 참여를 판단한다', async () => {
    const u = { id: 'u1', createdAt: joined(72) }
    const t = u.createdAt.getTime()
    mockFirsts([['u1', t + 20 * HOUR]], [['u1', t + 2 * HOUR]])
    const r = await computeActivation([u], NOW)
    expect(r.wrotePostWithin24h).toBe(1)
    expect(r.wroteCommentWithin24h).toBe(1)
    expect(r.medianHoursToFirst).toBe(2)   // 빠른 쪽
  })

  it('성숙 코호트가 0 이면 rate 는 null, status 는 NO_DENOM', async () => {
    mockFirsts([], [])
    const r = await computeActivation([{ id: 'u1', createdAt: joined(1) }], NOW)
    expect(r.rate).toBeNull()
    expect(r.status).toBe('NO_DENOM')
  })

  it('코호트가 비면 DB 를 조회하지 않는다', async () => {
    mockFirsts([], [])
    const r = await computeActivation([], NOW)
    expect(groupBy).not.toHaveBeenCalled()
    expect(r.cohortTotal).toBe(0)
    expect(r.status).toBe('NO_DENOM')
  })

  it('조회는 코호트 id 로만 좁힌다 (전수 스캔하지 않는다)', async () => {
    mockFirsts([], [])
    await computeActivation([{ id: 'u1', createdAt: joined(48) }], NOW)
    const where = (groupBy.mock.calls[0][1] as { where: { authorId: { in: string[] } } }).where
    expect(where.authorId.in).toEqual(['u1'])
  })
})

describe('4단계 재방문 — 채널 합산', () => {
  const q = (segment: string, d: number) => ({
    segment,
    d1: { denom: d, returned: 1, rate: null },
    d3: { denom: d, returned: 1, rate: null },
    d7: { denom: d, returned: 1, rate: null },
    d14: { denom: d, returned: 1, rate: null },
    d30: { denom: d, returned: 1, rate: null },
  })

  it('분면을 더해 전체 합산을 만든다', async () => {
    getRetentionQuadrants.mockResolvedValue({ windowDays: 90, members: [q('A', 10), q('B', 30)] })
    const r = await computeRetentionView()
    expect(r.combined?.d1).toEqual({ denom: 40, returned: 2, rate: 5 })
    expect(r.sourceWindowDays).toBe(90)
    expect(r.quadrants).toHaveLength(2)
  })

  it('분면이 없으면 합산은 null 이다 (0 으로 만들지 않는다)', async () => {
    getRetentionQuadrants.mockResolvedValue({ windowDays: 90, members: [] })
    const r = await computeRetentionView()
    expect(r.combined).toBeNull()
  })

  it('출처를 밝힌다 — 다른 정의의 비회원 리텐션과 섞지 않는다', async () => {
    getRetentionQuadrants.mockResolvedValue({ windowDays: 90, members: [] })
    const r = await computeRetentionView()
    expect(r.source).toContain('admin.retention')
    expect(r.note).toContain('신규 실회원')
  })
})

describe('기존 import 경로 호환', () => {
  it('🔴 옛 경로에서 VisitorSpan 타입을 그대로 가져올 수 있다', () => {
    // 타입은 compute 로 옮겼지만, 원래 `admin.member-recovery` 에서 export 되던 타입이다.
    // 재수출이 빠지면 옛 경로로 가져오던 코드가 조용히 깨진다.
    const span: OldVisitorSpan = { first: 1, last: 2 }
    expect(span.first).toBe(1)
    expect(span.last).toBe(2)
    // 두 경로의 타입이 같은 것인지도 고정한다 — 서로 대입되면 같은 타입이다.
    const viaCompute: NewVisitorSpan = span
    const viaOld: OldVisitorSpan = viaCompute
    expect(viaOld).toBe(span)
  })

  it('본체에서 타입과 계산 단위를 모두 계속 가져올 수 있다', async () => {
    const mod = await import('@/lib/queries/admin/admin.member-recovery')
    expect(mod.MEMBER_RECOVERY_WINDOWS).toEqual([7, 30])
    expect(mod.parseWindowDays('30')).toBe(30)
    expect(mod.parseWindowDays('7')).toBe(7)
    expect(mod.parseWindowDays(undefined)).toBe(7)
    expect(mod.parseWindowDays('아무거나')).toBe(7)
    expect(typeof mod.rateOf).toBe('function')
    expect(typeof mod.computeActivation).toBe('function')
    expect(typeof mod.getMemberRecovery).toBe('function')
  })
})
