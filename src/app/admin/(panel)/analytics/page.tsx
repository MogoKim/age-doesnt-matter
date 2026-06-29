import { prisma } from '@/lib/prisma'
import Link from 'next/link'

// 일자별 공식지표 히스토리 — DailyKpiSnapshot(EventLog 기준 스냅샷) 표시.
// GA4/CDO D7은 수집중단(stale)이라 공식에서 제외, dataQuality에 표기.
export const dynamic = 'force-dynamic'

const PERIODS = [30, 60, 90] as const
type RetentionJson = { d1?: { rate: number | null }; d7?: { rate: number | null } } | null
type DataQualityJson = { ga4?: string } | null

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : n.toLocaleString('ko-KR')
}
function pctStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : `${n}%`
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string }
}) {
  const days = (PERIODS as readonly number[]).includes(Number(searchParams.days))
    ? Number(searchParams.days)
    : 30

  // migration 미적용(테이블 부재) 상태로 코드만 먼저 배포돼도 페이지가 죽지 않도록 방어.
  // P2021(table does not exist) 등은 빈 목록 + 안내로 폴백.
  let rows: Awaited<ReturnType<typeof prisma.dailyKpiSnapshot.findMany>> = []
  let tableMissing = false
  try {
    rows = await prisma.dailyKpiSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: days,
    })
  } catch (err) {
    // 테이블 미생성(migration 전, Prisma P2021)만 안내로 폴백. 그 외 DB/쿼리 오류는 삼키지 않고 throw.
    const code = (err as { code?: string }).code
    const msg = err instanceof Error ? err.message : ''
    const isTableMissing = code === 'P2021' || /DailyKpiSnapshot.*does not exist|does not exist.*DailyKpiSnapshot/i.test(msg)
    if (!isTableMissing) throw err
    tableMissing = true
  }

  return (
    <section className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">일자별 운영지표 히스토리</h1>
          <p className="text-xs text-zinc-500">
            공식 기준 = EventLog 내부 DB(실고객 providerId 숫자 · 봇/내부 제외 · KST). GA4/CDO D7은 수집중단(legacy).
          </p>
        </div>
        <nav className="flex gap-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/admin/analytics?days=${p}`}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                p === days ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              {p}일
            </Link>
          ))}
        </nav>
      </header>

      {tableMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-700">
          ⚠️ DailyKpiSnapshot 테이블이 아직 없습니다. <strong>migration을 먼저 적용</strong>하세요
          (<code className="rounded bg-amber-100 px-1">prisma migrate deploy</code>) → 이후 <code className="rounded bg-amber-100 px-1">collect-dashboard-snapshot.ts</code>로 누적됩니다.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          아직 스냅샷이 없습니다. <code className="rounded bg-zinc-200 px-1">collect-dashboard-snapshot.ts</code> 실행 후 누적됩니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">날짜(KST)</th>
                <th className="px-3 py-2">UV</th>
                <th className="px-3 py-2">PV</th>
                <th className="px-3 py-2">PV/UV</th>
                <th className="px-3 py-2">신규가입</th>
                <th className="px-3 py-2">전환율</th>
                <th className="px-3 py-2">WAU</th>
                <th className="px-3 py-2">D1</th>
                <th className="px-3 py-2">D7</th>
                <th className="px-3 py-2 text-center">품질</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ret = r.retention as RetentionJson
                const dq = r.dataQuality as DataQualityJson
                const pvPerUv = r.uv > 0 ? Math.round((r.pv / r.uv) * 10) / 10 : null
                return (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-left font-bold text-zinc-700">{r.date}</td>
                    <td className="px-3 py-2">{fmt(r.uv)}</td>
                    <td className="px-3 py-2">{fmt(r.pv)}</td>
                    <td className="px-3 py-2 text-zinc-500">{fmt(pvPerUv)}</td>
                    <td className="px-3 py-2 font-bold text-zinc-900">{fmt(r.newSignups)}</td>
                    <td className="px-3 py-2">{pctStr(r.conversionRate)}</td>
                    <td className="px-3 py-2">{fmt(r.wau)}</td>
                    <td className="px-3 py-2 text-zinc-500">{pctStr(ret?.d1?.rate)}</td>
                    <td className="px-3 py-2 font-bold">{pctStr(ret?.d7?.rate)}</td>
                    <td className="px-3 py-2 text-center text-xs text-zinc-400">
                      {dq?.ga4 === 'stale' ? '🟢 EventLog' : '–'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
