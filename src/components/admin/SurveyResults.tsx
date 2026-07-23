'use client'

import type { SurveyResultsData } from '@/app/admin/(panel)/vote-events/actions'

/** 1분 의견함 결과 — 총 응답·회원/비회원 비율·문항별 요약(어드민 전용, 응답 비공개). */
export default function SurveyResults({ data }: { data: SurveyResultsData }) {
  const { total, memberCount, guestCount, summaries } = data
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

  if (total === 0) {
    return <p className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">아직 응답이 없습니다.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-indigo-50 p-3 text-center"><div className="text-xl font-extrabold text-indigo-700">{total}</div><div className="text-xs text-zinc-500">총 응답</div></div>
        <div className="rounded-lg bg-zinc-50 p-3 text-center"><div className="text-xl font-extrabold">{memberCount}</div><div className="text-xs text-zinc-500">회원 ({pct(memberCount, total)}%)</div></div>
        <div className="rounded-lg bg-zinc-50 p-3 text-center"><div className="text-xl font-extrabold">{guestCount}</div><div className="text-xs text-zinc-500">비회원 ({pct(guestCount, total)}%)</div></div>
      </div>

      {summaries.map((s) => (
        <div key={s.id} className="rounded-xl border bg-white p-4">
          <p className="mb-3 font-bold text-zinc-800 break-keep">{s.label} <span className="text-xs font-normal text-zinc-400">· 응답 {s.answered}</span></p>

          {(s.type === 'single_choice' || s.type === 'multiple_choice') && (
            <div className="space-y-2">
              {s.counts.map((c) => (
                <div key={c.option}>
                  <div className="flex justify-between text-sm"><span className="text-zinc-700 break-keep">{c.option}</span><span className="font-semibold text-zinc-500">{c.count} ({Math.round(c.ratio * 100)}%)</span></div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full bg-indigo-400" style={{ width: `${Math.round(c.ratio * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          {s.type === 'rating_1_5' && (
            <div>
              <p className="text-sm text-zinc-700 mb-2">평균 <b className="text-indigo-700 text-lg">{s.average.toFixed(2)}</b> / 5</p>
              <div className="space-y-1">
                {s.distribution.map((cnt, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-8 text-zinc-500">{i + 1}점</span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full bg-indigo-400" style={{ width: `${pct(cnt, s.answered)}%` }} /></div>
                    <span className="w-10 text-right text-zinc-500">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.type === 'scale_0_10' && (
            <div>
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <span className="rounded-lg bg-indigo-50 px-2.5 py-1.5">NPS <b className="text-indigo-700 text-lg">{s.nps}</b></span>
                <span className="rounded-lg bg-zinc-50 px-2.5 py-1.5">평균 <b>{s.average.toFixed(2)}</b> / 10</span>
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700">추천 {s.promoters}</span>
                <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-700">중립 {s.passives}</span>
                <span className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-700">비추천 {s.detractors}</span>
              </div>
              <div className="space-y-1">
                {s.distribution.map((cnt, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-8 text-zinc-500">{i}점</span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full bg-indigo-400" style={{ width: `${pct(cnt, s.answered)}%` }} /></div>
                    <span className="w-10 text-right text-zinc-500">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.type === 'consent' && <p className="text-sm text-zinc-700">동의 {s.accepted} / {s.answered}건</p>}

          {(s.type === 'short_text' || s.type === 'long_text') && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {s.texts.length === 0 ? <p className="text-sm text-zinc-400">응답 없음</p> :
                s.texts.map((t, i) => <p key={i} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 break-keep whitespace-pre-wrap">{t}</p>)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
