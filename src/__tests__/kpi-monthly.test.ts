import { describe, it, expect } from 'vitest'
import { aggregateMonthly, type SnapshotRow } from '@/lib/queries/admin/admin.kpi-history'

// 최소 스냅샷 행 헬퍼 (미사용 필드는 0/기본)
function row(date: string, uv: number, pv: number, newSignups: number, wau: number, ret?: Record<string, { denom: number; returned: number; rate: number | null }>): SnapshotRow {
  return {
    id: `id-${date}`, date, uv, pv, memberUv: 0, guestUv: 0, newSignups,
    conversionRate: uv > 0 ? Math.round((newSignups / uv) * 1000) / 10 : null,
    userPosts: 0, userComments: 0, wau, realCustomers: 0,
    channels: null, retention: ret ?? null, dataQuality: null, updatedAt: '2026-07-01T00:00:00Z',
  }
}

describe('aggregateMonthly — 월별 집계 (합=sum, 비율=raw 재계산)', () => {
  it('YYYY-MM으로 그룹핑 + desc 정렬 + label YYYY.MM', () => {
    const rows = [row('2026-07-02', 100, 150, 2, 10), row('2026-07-01', 200, 400, 4, 20), row('2026-06-30', 50, 60, 1, 8)]
    const out = aggregateMonthly(rows)
    expect(out.map((m) => m.key)).toEqual(['2026-07', '2026-06'])
    expect(out[0].label).toBe('2026.07')
    expect(out[0].days).toBe(2)
  })

  it('uv/pv/newSignups는 합산, wau는 월 평균', () => {
    const out = aggregateMonthly([row('2026-07-02', 100, 150, 2, 10), row('2026-07-01', 200, 400, 4, 20)])
    const jul = out[0]
    expect(jul.uv).toBe(300)
    expect(jul.pv).toBe(550)
    expect(jul.newSignups).toBe(6)
    expect(jul.wau).toBe(15) // (10+20)/2
  })

  it('전환%는 일별 %의 평균이 아니라 신규합/uv합*100 재계산', () => {
    // 일별: 2/100=2.0%, 4/200=2.0% → 합산 6/300=2.0%
    const out = aggregateMonthly([row('2026-07-02', 100, 150, 2, 10), row('2026-07-01', 200, 400, 4, 20)])
    expect(out[0].conversionRate).toBe(2.0)
    // 비대칭 케이스: 1/10=10%, 1/1000=0.1% → 단순평균이면 5.05%, 재계산은 2/1010≈0.2%
    const out2 = aggregateMonthly([row('2026-08-02', 10, 10, 1, 5), row('2026-08-01', 1000, 1000, 1, 5)])
    expect(out2[0].conversionRate).toBe(0.2)
  })

  it('D1/D7은 denom·returned 합 기반 분모가중 재계산', () => {
    const r1 = { d1: { denom: 100, returned: 10, rate: 10 }, d7: { denom: 100, returned: 5, rate: 5 } }
    const r2 = { d1: { denom: 300, returned: 30, rate: 10 }, d7: { denom: 300, returned: 3, rate: 1 } }
    const out = aggregateMonthly([row('2026-07-02', 1, 1, 0, 1, r1), row('2026-07-01', 1, 1, 0, 1, r2)])
    // d1: (10+30)/(100+300)=10.0% / d7: (5+3)/(100+300)=2.0%
    expect(out[0].d1).toBe(10.0)
    expect(out[0].d7).toBe(2.0)
  })

  it('retention 없으면 D1/D7 null, denom 0이면 null', () => {
    const out = aggregateMonthly([row('2026-07-01', 100, 100, 1, 10)])
    expect(out[0].d1).toBeNull()
    expect(out[0].d7).toBeNull()
    const zero = { d1: { denom: 0, returned: 0, rate: null }, d7: { denom: 0, returned: 0, rate: null } }
    const out2 = aggregateMonthly([row('2026-07-01', 100, 100, 1, 10, zero)])
    expect(out2[0].d1).toBeNull()
  })

  it('빈 입력 → 빈 배열', () => {
    expect(aggregateMonthly([])).toEqual([])
  })
})
