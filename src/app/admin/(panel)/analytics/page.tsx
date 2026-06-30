import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import Sparkline from '@/components/admin/Sparkline'
import { deriveKpiHistory, type SnapshotRow, type Level } from '@/lib/queries/admin/admin.kpi-history'

// 일자별 공식지표 히스토리 — DailyKpiSnapshot(EventLog 기준 스냅샷)만 사용(EventLog 재집계 없음).
// 구조: ① 운영 상태 요약 ② KPI 카드+스파크라인 ③ 채널 품질 ④ 일자별 정밀표.
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
const LEVEL_CLS: Record<Level, string> = {
  좋음: 'bg-green-100 text-green-700',
  주의: 'bg-amber-100 text-amber-700',
  위험: 'bg-red-100 text-red-700',
}
function DeltaTag({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-400">–</span>
  if (pct === 0) return <span className="text-zinc-400">0%</span>
  const up = pct > 0
  return <span className={up ? 'font-bold text-green-600' : 'font-bold text-red-600'}>{up ? '▲' : '▼'}{Math.abs(pct)}%</span>
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string }
}) {
  const days = (PERIODS as readonly number[]).includes(Number(searchParams.days))
    ? Number(searchParams.days)
    : 30

  // 테이블 부재(migration 전, P2021)만 안내로 폴백. 그 외 오류는 throw.
  let rows: SnapshotRow[] = []
  let tableMissing = false
  try {
    rows = (await prisma.dailyKpiSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: days,
    })) as unknown as SnapshotRow[]
  } catch (err) {
    const code = (err as { code?: string }).code
    const msg = err instanceof Error ? err.message : ''
    const isTableMissing = code === 'P2021' || /DailyKpiSnapshot.*does not exist|does not exist.*DailyKpiSnapshot/i.test(msg)
    if (!isTableMissing) throw err
    tableMissing = true
  }

  const k = deriveKpiHistory(rows)

  return (
    <section className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">운영지표 히스토리</h1>
          <p className="text-xs text-zinc-500">
            공식 기준 = EventLog 스냅샷(DailyKpiSnapshot · 실고객 providerId 숫자 · 봇/내부 제외 · KST). GA4/CDO는 legacy(제외).
            {k && <span className="ml-1 text-zinc-400">· 최신 {k.latestDate} 갱신 {new Date(k.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <nav className="flex gap-1">
          {PERIODS.map((p) => (
            <Link key={p} href={`/admin/analytics?days=${p}`}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${p === days ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
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
      ) : !k ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          아직 스냅샷이 없습니다. <code className="rounded bg-zinc-200 px-1">collect-dashboard-snapshot.ts</code> 실행 후 누적됩니다.
        </div>
      ) : (
        <>
          {/* ① 운영 상태 요약 */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-zinc-900">오늘 상태 ({k.latestDate})</span>
              {k.badges.map((b) => (
                <span key={b.key} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL_CLS[b.level]}`}>
                  {b.key} {b.level}
                </span>
              ))}
            </div>
            <ul className="mb-3 space-y-1 text-sm text-zinc-700">
              {k.statusSentences.map((s, i) => <li key={i}>· {s}</li>)}
            </ul>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                { l: 'UV', v: fmt(k.uv), sub: k.uvVsAvg7Pct === null ? '' : `7일평균 ${k.uvVsAvg7Pct > 0 ? '+' : ''}${k.uvVsAvg7Pct}%` },
                { l: 'PV/UV', v: k.pvPerUv === null ? '–' : `${k.pvPerUv}`, sub: '체류 깊이' },
                { l: '신규가입', v: fmt(k.newSignups), sub: '실고객' },
                { l: 'WAU', v: fmt(k.wau), sub: '주간활성' },
                { l: 'D7', v: k.d7 === null ? '–' : `${k.d7}%`, sub: '비회원 재방문' },
                { l: 'D1', v: k.d1 === null ? '–' : `${k.d1}%`, sub: '비회원 재방문' },
              ].map((c) => (
                <div key={c.l} className="rounded-lg bg-zinc-50 px-3 py-2">
                  <div className="text-xs text-zinc-500">{c.l}</div>
                  <div className="text-lg font-bold text-zinc-900">{c.v}</div>
                  <div className="text-[11px] text-zinc-400">{c.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ② KPI 카드 + 7일 스파크라인 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {k.cards.map((c) => (
              <div key={c.key} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-bold text-zinc-500">{c.label}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-zinc-900">{c.value}</span>
                  <span className="text-xs"><DeltaTag pct={c.deltaPct} /></span>
                </div>
                <div className="mt-2"><Sparkline values={c.spark} width={180} height={32} color={c.key === 'd7' ? '#2563eb' : '#FF6F61'} /></div>
                <div className="mt-1 text-[11px] text-zinc-400">{c.note}</div>
              </div>
            ))}
          </div>

          {/* ③ 채널 품질 */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-2 text-sm font-bold text-zinc-900">채널 품질 (최근 30일 · 어디서 온 사람이 가입하나)</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-right text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr><th className="py-1 pr-3 text-left">채널</th><th className="py-1 pr-3">유입 세션</th><th className="py-1 pr-3">가입(30일)</th><th className="py-1 pr-3">가입률</th><th className="py-1 text-left">상태</th></tr>
                </thead>
                <tbody>
                  {k.channels.map((c) => {
                    const dead = c.sessions >= 300 && c.signups30d === 0
                    const good = (c.signupRate ?? 0) >= 3
                    return (
                      <tr key={c.channel} className="border-t border-zinc-100">
                        <td className="py-1.5 pr-3 text-left font-medium text-zinc-800">{c.channel}</td>
                        <td className="py-1.5 pr-3 text-zinc-600">{fmt(c.sessions)}</td>
                        <td className="py-1.5 pr-3 font-bold text-zinc-900">{fmt(c.signups30d)}</td>
                        <td className="py-1.5 pr-3">{c.signupRate === null ? '–' : `${c.signupRate}%`}</td>
                        <td className="py-1.5 text-left text-xs">
                          {dead ? <span className="font-bold text-red-600">유입 많음 / 가입 없음</span>
                            : good ? <span className="font-bold text-green-600">전환 우수</span>
                            : <span className="text-zinc-400">–</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 전주 대비 */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
            {k.weekOverWeek ? (
              <span className="text-zinc-700">
                <strong>전주 대비(주간 합)</strong> · UV <DeltaTag pct={k.weekOverWeek.uv} /> · PV <DeltaTag pct={k.weekOverWeek.pv} /> · 신규가입 <DeltaTag pct={k.weekOverWeek.signups} />
              </span>
            ) : (
              <span className="text-zinc-500">전주 대비는 데이터 14일 이상 누적 후 표시됩니다. (현재 {rows.length}일)</span>
            )}
          </div>

          {/* ④ 일자별 정밀표 (전일 대비 화살표) */}
          <div className="overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">날짜(KST)</th><th className="px-3 py-2">UV</th><th className="px-3 py-2">PV</th>
                  <th className="px-3 py-2">PV/UV</th><th className="px-3 py-2">신규가입</th><th className="px-3 py-2">전환율</th>
                  <th className="px-3 py-2">WAU</th><th className="px-3 py-2">D1</th><th className="px-3 py-2">D7</th><th className="px-3 py-2 text-center">품질</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ret = r.retention as RetentionJson
                  const dq = r.dataQuality as DataQualityJson
                  const pvPerUv = r.uv > 0 ? Math.round((r.pv / r.uv) * 10) / 10 : null
                  const prev = rows[i + 1] // 다음 행 = 하루 전(내림차순)
                  const uvDelta = prev && prev.uv > 0 ? Math.round(((r.uv - prev.uv) / prev.uv) * 100) : null
                  return (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 text-left font-bold text-zinc-700">{r.date}</td>
                      <td className="px-3 py-2">{fmt(r.uv)} <span className="text-[11px]"><DeltaTag pct={uvDelta} /></span></td>
                      <td className="px-3 py-2">{fmt(r.pv)}</td>
                      <td className="px-3 py-2 text-zinc-500">{fmt(pvPerUv)}</td>
                      <td className="px-3 py-2 font-bold text-zinc-900">{fmt(r.newSignups)}</td>
                      <td className="px-3 py-2">{pctStr(r.conversionRate)}</td>
                      <td className="px-3 py-2">{fmt(r.wau)}</td>
                      <td className="px-3 py-2 text-zinc-500">{pctStr(ret?.d1?.rate)}</td>
                      <td className="px-3 py-2 font-bold">{pctStr(ret?.d7?.rate)}</td>
                      <td className="px-3 py-2 text-center text-xs text-zinc-400">{dq?.ga4 === 'stale' ? '🟢 EventLog' : '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
