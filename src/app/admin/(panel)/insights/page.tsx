import type { Metadata } from 'next'
import { getInsights } from '@/lib/queries/admin'

export const metadata: Metadata = { title: '인사이트' }
export const revalidate = 120

export default async function AdminInsightsPage() {
  const data = await getInsights()

  const delta = data.northStar.current - data.northStar.previous
  const weeklyMax = Math.max(...data.northStar.weekly.map((w) => w.returning), 1)
  const collectedLabel = new Date(data.generatedAt).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">📈 인사이트</h1>
        <p className="mt-1 text-sm text-zinc-500">
          봇 제외 실고객 데이터 · 기준 최근 30일 · 캐시 30분 (마지막 집계 {collectedLabel})
        </p>
      </div>

      {/* 🎯 북극성 */}
      <section className="rounded-xl border border-[#FF6F61]/30 bg-[#FF6F61]/5 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#FF6F61]">🎯 북극성 — 주간 재방문 실고객 수</p>
            <p className="mt-0.5 text-xs text-zinc-500">가입 이후의 주에 다시 온 진짜 손님 (봇 제외)</p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-zinc-900">{data.northStar.current}</span>
            <span className="ml-1 text-sm text-zinc-500">명</span>
            <p className={`mt-0.5 text-xs font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-zinc-400'}`}>
              {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— 변화 없음'} (지난주 {data.northStar.previous})
            </p>
          </div>
        </div>
        {/* 8주 추이 막대 */}
        <div className="mt-4 flex h-20 items-end gap-2">
          {data.northStar.weekly.map((w, i) => {
            const h = Math.max(4, Math.round((w.returning / weeklyMax) * 72))
            const isCurrent = i === data.northStar.weekly.length - 1
            return (
              <div key={w.weekLabel} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-zinc-600">{w.returning}</span>
                <div
                  className={`w-full rounded-t-sm ${isCurrent ? 'bg-[#FF6F61]' : 'bg-[#FF6F61]/40'}`}
                  style={{ height: `${h}px` }}
                />
                <span className="text-[10px] text-zinc-400">{w.weekLabel}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label="실고객 수" value={`${data.realUserCount}명`} sub={`봇 ${data.botUserCount}개 제외`} />
        <MiniStat label="최근 7일 신규" value={`${data.new7d}명`} sub="실고객 가입" />
        <MiniStat label="세션 재방문율" value={`${data.retention.sessionReturnRate}%`} sub={`${data.retention.sessionTotal}세션 중`} />
        <MiniStat label="로그인 재방문율" value={`${data.retention.loginReturnRate}%`} sub={`${data.retention.loginUsers}명 중 2일+`} />
      </div>

      {/* ① 들어오기 — 채널 효율 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-zinc-900">① 들어오기 — 유입 채널 효율</h2>
        <p className="mb-4 text-xs text-zinc-400">어디서 온 손님이 가입하고 다시 오는가 (세션 첫 referrer, 30일)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-4 font-medium">채널</th>
                <th className="py-2 pr-4 text-right font-medium">세션</th>
                <th className="py-2 pr-4 text-right font-medium">가입전환</th>
                <th className="py-2 text-right font-medium">재방문율</th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((c) => (
                <tr key={c.channel} className="border-b border-zinc-100">
                  <td className="py-2 pr-4 font-medium text-zinc-800">{c.channel}</td>
                  <td className="py-2 pr-4 text-right text-zinc-600">{c.sessions.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className={c.signupRate >= 10 ? 'font-bold text-green-700' : 'text-zinc-600'}>
                      {c.signups}명 {c.signupRate}%
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <span className={c.retentionRate >= 10 ? 'font-bold text-green-700' : 'text-zinc-600'}>
                      {c.retentionRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ② 첫 경험 — 활성화 퍼널 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-zinc-900">② 첫 경험 — 활성화 퍼널</h2>
        <p className="mb-4 text-xs text-zinc-400">가입한 실고객이 실제로 쓰기까지 (전체 기간 누적)</p>
        <FunnelBar label="가입 실고객" value={data.activation.total} base={data.activation.total} />
        <FunnelBar label="온보딩 완료" value={data.activation.onboarded} base={data.activation.total} />
        <FunnelBar label="글 작성" value={data.activation.wrote} base={data.activation.total} />
        <FunnelBar label="댓글 작성" value={data.activation.commented} base={data.activation.total} />
        <FunnelBar label="활동(글 or 댓글)" value={data.activation.active} base={data.activation.total} highlight />
      </section>

      {/* ③ 다시 오기 — 리텐션 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-zinc-900">③ 다시 오기 — 리텐션</h2>
        <p className="mb-4 text-xs text-zinc-400">한 번 온 사람이 다시 오는가 (30일)</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">세션 재방문 (비회원 포함)</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{data.retention.sessionReturnRate}%</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              전체 {data.retention.sessionTotal.toLocaleString()}세션 중 {data.retention.sessionReturn}세션이 2일+ 방문
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">로그인 재방문 (가입자)</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{data.retention.loginReturnRate}%</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              login {data.retention.loginUsers}명 중 {data.retention.loginReturn}명이 2일+ 로그인
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
    </div>
  )
}

function FunnelBar({ label, value, base, highlight }: { label: string; value: number; base: number; highlight?: boolean }) {
  const ratio = base > 0 ? Math.round((value / base) * 1000) / 10 : 0
  const width = base > 0 ? Math.max(2, Math.round((value / base) * 100)) : 0
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-zinc-600">{label}</span>
      <div className="relative h-6 flex-1 rounded bg-zinc-100">
        <div
          className={`absolute inset-y-0 left-0 rounded transition-all ${highlight ? 'bg-[#FF6F61]/70' : 'bg-zinc-300'}`}
          style={{ width: `${width}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-zinc-700">
          {value}명 ({ratio}%)
        </span>
      </div>
    </div>
  )
}
