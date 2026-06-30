'use client'

import { useState } from 'react'
import Sparkline from '@/components/admin/Sparkline'
import { deriveKpiHistory, aggregateWeekly, type SnapshotRow, type Level } from '@/lib/queries/admin/admin.kpi-history'

const LEVEL_CLS: Record<Level, string> = {
  좋음: 'bg-green-100 text-green-700',
  주의: 'bg-amber-100 text-amber-700',
  위험: 'bg-red-100 text-red-700',
}
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('ko-KR'))
function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-400">–</span>
  if (pct === 0) return <span className="text-zinc-400">0%</span>
  return <span className={pct > 0 ? 'font-bold text-green-600' : 'font-bold text-red-600'}>{pct > 0 ? '▲' : '▼'}{Math.abs(pct)}%</span>
}
type Period = 7 | 30 | 90
type Grain = 'day' | 'week'

export default function KpiHistoryPanel({ rows }: { rows: SnapshotRow[] }) {
  const [period, setPeriod] = useState<Period>(30)
  const [grain, setGrain] = useState<Grain>('day')

  const k = deriveKpiHistory(rows) // 요약/카드/채널 = 최신 완료일 기준(고정)
  if (!k) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
        완료 스냅샷이 아직 없습니다. (DailyKpiSnapshot 누적 후 표시)
      </section>
    )
  }
  const windowRows = rows.slice(0, period)
  const weekly = aggregateWeekly(windowRows)

  const overallBorder = k.badges.some((b) => b.level === '위험')
    ? 'border-red-400'
    : k.badges.some((b) => b.level === '주의')
      ? 'border-amber-400'
      : 'border-green-400'
  const cardDelta = (key: string) => k.cards.find((c) => c.key === key)?.deltaPct ?? null

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm">
      {/* 완료 데이터 라벨 (실시간과 시각 구분) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white">✓ 완료 데이터</span>
        <span className="text-xs text-zinc-500">최신 완료일 <b className="text-zinc-700">{k.latestDate}</b> · EventLog 스냅샷(봇/내부 제외·KST) · 갱신 {new Date(k.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {/* ① 상태 요약 — HERO(핵심 숫자 먼저, 그다음 문장) */}
      <div className={`rounded-xl border-l-4 ${overallBorder} bg-zinc-50 p-4`}>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {k.badges.map((b) => (
            <span key={b.key} className={`rounded-full px-3 py-1 text-sm font-bold ${LEVEL_CLS[b.level]}`}>{b.key} {b.level}</span>
          ))}
        </div>
        {/* 핵심 숫자 — 크게(한눈에). 모바일 2열 → 가로스크롤 없음 */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: 'UV', v: fmt(k.uv), d: cardDelta('uv'), sub: k.uvVsAvg7Pct === null ? '' : `7일평균 ${k.uvVsAvg7Pct > 0 ? '+' : ''}${k.uvVsAvg7Pct}%` },
            { l: '신규가입', v: fmt(k.newSignups), d: cardDelta('signups'), sub: '실고객' },
            { l: 'WAU', v: fmt(k.wau), d: cardDelta('wau'), sub: '주간활성' },
            { l: 'D7', v: k.d7 === null ? '–' : `${k.d7}%`, d: null, sub: '비회원 재방문' },
          ].map((n) => (
            <div key={n.l} className="rounded-lg bg-white px-3 py-2 shadow-sm">
              <div className="text-xs text-zinc-500">{n.l}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-zinc-900">{n.v}</span>
                <span className="text-xs"><Delta pct={n.d} /></span>
              </div>
              {n.sub && <div className="text-[11px] text-zinc-400">{n.sub}</div>}
            </div>
          ))}
        </div>
        <ul className="space-y-1 text-sm font-medium text-zinc-800">{k.statusSentences.map((s, i) => <li key={i}>· {s}</li>)}</ul>
      </div>

      {/* ② 채널 품질 — 첫 화면(어디서 온 사람이 가입하나) */}
      <div className="rounded-xl border border-zinc-200 p-3">
        <div className="mb-1 text-sm font-bold text-zinc-900">채널 품질 (최근 30일 · 어디서 온 사람이 가입하나)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-right text-sm">
            <thead className="text-xs text-zinc-500"><tr><th className="py-1 pr-3 text-left">채널</th><th className="py-1 pr-3">유입</th><th className="py-1 pr-3">가입(30일)</th><th className="py-1 pr-3">가입률</th><th className="py-1 text-left">상태</th></tr></thead>
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
                    <td className="py-1.5 text-left text-xs">{dead ? <span className="font-bold text-red-600">유입 많음 / 가입 없음</span> : good ? <span className="font-bold text-green-600">전환 우수</span> : <span className="text-zinc-400">–</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ③ KPI 7일 추이 — 모바일은 숫자+전일대비만(2열), 스파크라인/설명은 데스크탑 */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        {k.cards.map((c) => (
          <div key={c.key} className="rounded-xl border border-zinc-200 p-3">
            <div className="text-xs font-bold text-zinc-500">{c.label}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-xl font-extrabold text-zinc-900 sm:text-2xl">{c.value}</span>
              <span className="text-xs"><Delta pct={c.deltaPct} /></span>
            </div>
            <div className="hidden sm:block">
              <Sparkline values={c.spark} width={170} height={30} color={c.key === 'd7' ? '#2563eb' : '#FF6F61'} />
              <div className="mt-0.5 text-[11px] text-zinc-400">{c.note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 전주 대비 */}
      <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
        {k.weekOverWeek ? (
          <span className="text-zinc-700"><b>전주 대비(주간 합)</b> · UV <Delta pct={k.weekOverWeek.uv} /> · PV <Delta pct={k.weekOverWeek.pv} /> · 신규가입 <Delta pct={k.weekOverWeek.signups} /></span>
        ) : (
          <span className="text-zinc-500">전주 대비는 데이터 14일 이상 누적 후 표시됩니다. (현재 {rows.length}일)</span>
        )}
      </div>

      {/* ④ 필터 + 정밀표 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(['day', 'week'] as Grain[]).map((g) => (
            <button key={g} onClick={() => setGrain(g)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${grain === g ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{g === 'day' ? '일별' : '주별'}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {([7, 30, 90] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${period === p ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{p}일</button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        {grain === 'day' ? (
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500"><tr>
              <th className="px-3 py-2 text-left">날짜(KST)</th><th className="px-3 py-2">UV</th><th className="px-3 py-2">PV</th><th className="px-3 py-2">PV/UV</th><th className="px-3 py-2">신규</th><th className="px-3 py-2">전환%</th><th className="px-3 py-2">WAU</th><th className="px-3 py-2">D1</th><th className="px-3 py-2">D7</th>
            </tr></thead>
            <tbody>
              {windowRows.map((r, i) => {
                const ret = r.retention as { d1?: { rate: number | null }; d7?: { rate: number | null } } | null
                const pvuv = r.uv > 0 ? Math.round((r.pv / r.uv) * 10) / 10 : null
                const prev = windowRows[i + 1]
                const dl = prev && prev.uv > 0 ? Math.round(((r.uv - prev.uv) / prev.uv) * 100) : null
                return (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-left font-bold text-zinc-700">{r.date}</td>
                    <td className="px-3 py-2">{fmt(r.uv)} <span className="text-[11px]"><Delta pct={dl} /></span></td>
                    <td className="px-3 py-2">{fmt(r.pv)}</td>
                    <td className="px-3 py-2 text-zinc-500">{fmt(pvuv)}</td>
                    <td className="px-3 py-2 font-bold text-zinc-900">{fmt(r.newSignups)}</td>
                    <td className="px-3 py-2">{r.conversionRate === null ? '–' : `${r.conversionRate}%`}</td>
                    <td className="px-3 py-2">{fmt(r.wau)}</td>
                    <td className="px-3 py-2 text-zinc-500">{ret?.d1?.rate == null ? '–' : `${ret.d1.rate}%`}</td>
                    <td className="px-3 py-2 font-bold">{ret?.d7?.rate == null ? '–' : `${ret.d7.rate}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[520px] text-right text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500"><tr>
              <th className="px-3 py-2 text-left">주(월~일)</th><th className="px-3 py-2">일수</th><th className="px-3 py-2">UV 합</th><th className="px-3 py-2">PV 합</th><th className="px-3 py-2">신규 합</th><th className="px-3 py-2">WAU 평균</th><th className="px-3 py-2">D7 평균</th>
            </tr></thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.key} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-left font-bold text-zinc-700">{w.label}</td>
                  <td className="px-3 py-2 text-zinc-500">{w.days}일</td>
                  <td className="px-3 py-2">{fmt(w.uv)}</td>
                  <td className="px-3 py-2">{fmt(w.pv)}</td>
                  <td className="px-3 py-2 font-bold text-zinc-900">{fmt(w.newSignups)}</td>
                  <td className="px-3 py-2">{fmt(w.wau)}</td>
                  <td className="px-3 py-2 font-bold">{w.d7 == null ? '–' : `${w.d7}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
