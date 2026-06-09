import { getInsights, type RetentionData } from '@/lib/queries/admin'
import InfoTip from '@/components/admin/InfoTip'

type InsightsData = Awaited<ReturnType<typeof getInsights>>

// 대시보드에 통합된 인사이트 섹션 (구 /admin/insights 본문). data·retention은 대시보드에서 병렬 페칭해 전달.
export default function InsightsSection({ data, retention }: { data: InsightsData; retention: RetentionData }) {
  const delta = data.northStar.current - data.northStar.previous
  const weeklyMax = Math.max(...data.northStar.weekly.map((w) => w.active), 1)
  const collectedLabel = new Date(data.generatedAt).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-900">📈 인사이트</h2>
        <p className="mt-1 text-sm text-zinc-500">
          봇 제외 실고객 데이터 · 기준 최근 30일 · 캐시 30분 (마지막 집계 {collectedLabel})
        </p>
      </div>

      {/* 🎯 북극성 — 주간 활성 실고객(WAU) */}
      <section className="rounded-xl border border-[#FF6F61]/30 bg-[#FF6F61]/5 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#FF6F61]">
              🎯 북극성 — 주간 활성 실고객 (WAU)
              <InfoTip text="최근 7일간 방문 또는 로그인한 실고객(봇 제외) 수. 매주 꾸준히 우나어를 쓰는 회원 규모를 나타냅니다. 이 숫자가 늘면 서비스가 건강하게 성장 중입니다." />
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">이번 주에 활동한 진짜 회원 수</p>
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
            const h = Math.max(4, Math.round((w.active / weeklyMax) * 72))
            const isCurrent = i === data.northStar.weekly.length - 1
            return (
              <div key={w.weekLabel} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-zinc-600">{w.active}</span>
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
      <div className="grid grid-cols-2 gap-4">
        <MiniStat
          label="실고객 수"
          value={`${data.realUserCount}명`}
          sub={`봇 ${data.botUserCount}개 제외`}
          tip="providerId가 순수 숫자인 진짜 카카오 가입 회원 수입니다. curator·seed 등 봇 계정은 모두 제외했습니다."
        />
        <MiniStat
          label="최근 7일 신규"
          value={`${data.new7d}명`}
          sub="실고객 가입"
          tip="최근 7일간 새로 가입한 실고객 수(봇 제외)입니다."
        />
      </div>

      {/* ① 들어오기 — 채널 효율 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-zinc-900">
          ① 들어오기 — 유입 채널 효율
          <InfoTip text="어느 경로로 들어온 손님이 가입하고 다시 오는지. 세션=세션 첫 referrer로 분류한 30일 유입량. 가입자=실고객의 '최초 유입(first-touch) 채널'로 귀속한 누적 가입 명수(가입은 항상 카카오 로그인 세션이라, 세션단위로 세면 전부 직접입력으로 쏠려 first-touch로 교정함). 재방문율=서로 다른 2일+ 방문 비율." />
        </h2>
        <p className="mb-1 text-xs text-zinc-400">어디서 온 손님이 가입하고 다시 오는가 (세션 첫 referrer, 30일)</p>
        <p className="mb-4 text-xs text-zinc-400">
          · <b>세션</b>=30일 유입(세션 첫 referrer) · <b>가입자</b>=<b>최초 유입(first-touch)</b> 채널로 귀속한 누적 가입 실고객(%는 30일 세션 대비 근사) · <b>재방문율</b>=서로 다른 2일+ 방문 비율
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-4 font-medium">채널</th>
                <th className="py-2 pr-4 text-right font-medium">유입 세션</th>
                <th className="py-2 pr-4 text-right font-medium">가입자(최초유입)</th>
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
        <h2 className="mb-1 text-sm font-bold text-zinc-900">
          ② 첫 경험 — 활성화 퍼널
          <InfoTip text="가입한 실고객이 온보딩→글→댓글까지 얼마나 도달하는지 봅니다. 전체 기간 누적이며, 가입만 하고 안 쓰는 이탈 구간을 찾는 지표입니다." />
        </h2>
        <p className="mb-4 text-xs text-zinc-400">가입한 실고객이 실제로 쓰기까지 (전체 기간 누적)</p>
        <FunnelBar label="가입 실고객" value={data.activation.total} base={data.activation.total} />
        <FunnelBar label="온보딩 완료" value={data.activation.onboarded} base={data.activation.total} />
        <FunnelBar label="글 작성" value={data.activation.wrote} base={data.activation.total} />
        <FunnelBar label="댓글 작성" value={data.activation.commented} base={data.activation.total} />
        <FunnelBar label="활동(글 or 댓글)" value={data.activation.active} base={data.activation.total} highlight />
      </section>

      {/* ③ 다시 오기 — 리텐션 4분면 */}
      <RetentionQuadrants retention={retention} />
    </div>
  )
}

function RetentionQuadrants({ retention }: { retention: RetentionData }) {
  const rows = [...retention.members, ...retention.guests]
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-zinc-900">
        ③ 다시 오기 — 리텐션 (TWA/웹 × 회원/비회원)
        <InfoTip text="같은 코호트(같은 사람들)를 끝까지 추적하는 생존곡선입니다. D-N = 가입(첫방문) 후 N일째 이후 다시 온 비율. 분모는 세그먼트 전체로 고정돼 D1≥D3≥…≥D30로 단조 감소합니다. 아직 N일 안 지난 사람은 미달로 집계돼 D14·D30이 낮게 시작 후 시간이 지나며 오릅니다. 괄호=코호트 명수, 작으면 참고용." />
      </h2>
      <p className="mb-4 text-xs text-zinc-400">
        최근 {retention.windowDays}일 고정 코호트 생존곡선 · D-N = 가입 후 N일 생존(전체 분모, 단조) · 괄호 = 코호트 명수
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-2 pr-4 font-medium">세그먼트</th>
              <th className="py-2 pr-4 text-right font-medium">D1</th>
              <th className="py-2 pr-4 text-right font-medium">D3</th>
              <th className="py-2 pr-4 text-right font-medium">D7</th>
              <th className="py-2 pr-4 text-right font-medium">D14</th>
              <th className="py-2 text-right font-medium">D30</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.segment} className="border-b border-zinc-100">
                <td className="py-2 pr-4 font-medium text-zinc-800">{r.segment}</td>
                <td className="py-2 pr-4 text-right text-zinc-700">{r.d1.rate}% <span className="text-zinc-400">({r.d1.cohort})</span></td>
                <td className="py-2 pr-4 text-right text-zinc-700">{r.d3.rate}% <span className="text-zinc-400">({r.d3.cohort})</span></td>
                <td className="py-2 pr-4 text-right text-zinc-700">{r.d7.rate}% <span className="text-zinc-400">({r.d7.cohort})</span></td>
                <td className="py-2 pr-4 text-right text-zinc-700">{r.d14.rate}% <span className="text-zinc-400">({r.d14.cohort})</span></td>
                <td className="py-2 text-right text-zinc-700">{r.d30.rate}% <span className="text-zinc-400">({r.d30.cohort})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-400">{retention.note}</p>
    </section>
  )
}

function MiniStat({ label, value, sub, tip }: { label: string; value: string; sub: string; tip: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}<InfoTip text={tip} /></p>
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
