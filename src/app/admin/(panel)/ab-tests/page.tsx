import type { Metadata } from 'next'
import { getWebExperiments, getGateITT } from '@/lib/queries/admin'
import type { WebExperimentView, VariantStat, GateITTResult, GateITTRow, RetDay } from '@/lib/queries/admin/admin.experiments-web'
import type { Confidence } from '@/lib/experiments/stats'
import PeriodFilter from './PeriodFilter'
import ExperimentStatePanel from './ExperimentStatePanel'

export const metadata: Metadata = { title: '웹 A/B 테스트' }
export const dynamic = 'force-dynamic'

const PERIOD_DAYS: Record<string, number> = { '7': 7, '30': 30, all: 3650 }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '기획 중', cls: 'bg-zinc-100 text-zinc-600' },
  ACTIVE: { label: '진행 중', cls: 'bg-blue-50 text-blue-700' },
  PAUSED: { label: '일시정지', cls: 'bg-amber-50 text-amber-700' },
  CONCLUDED: { label: '종료', cls: 'bg-green-50 text-green-700' },
}

const CONFIDENCE_META: Record<Confidence, { label: string; cls: string; hint: string }> = {
  significant: { label: '🟢 유의미 95%', cls: 'bg-green-50 text-green-700', hint: '채택해도 됩니다. 결론을 내리세요.' },
  need_more: { label: '🟡 표본 더 필요', cls: 'bg-amber-50 text-amber-700', hint: '우열은 보이나 아직 확실하지 않아요.' },
  insufficient: { label: '⚪ 표본 부족', cls: 'bg-zinc-100 text-zinc-500', hint: '데이터가 적어 아직 판단할 수 없어요.' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.ACTIVE!
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${m.cls}`}>{m.label}</span>
}

function VariantRow({ v, maxRate, enough }: { v: VariantStat; maxRate: number; enough: boolean }) {
  const width = maxRate > 0 ? Math.max(3, Math.round((v.rate / maxRate) * 100)) : 3
  const dim = !enough
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-3">
        <span className="w-44 shrink-0 text-sm font-medium text-zinc-700">
          {v.label}
          {v.isWinner && <span className="ml-1 text-[#FF6F61]">★ 승자</span>}
        </span>
        <div className={`relative h-6 flex-1 rounded bg-zinc-100 ${dim ? 'border border-dashed border-zinc-300' : ''}`}>
          <div
            className={`absolute inset-y-0 left-0 rounded ${v.isWinner ? 'bg-[#FF6F61]/70' : 'bg-zinc-300'}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className="w-36 shrink-0 text-right text-sm">
          <b className={dim ? 'text-zinc-400' : v.isWinner ? 'text-[#FF6F61]' : 'text-zinc-800'}>{v.rate}%</b>
          <span className="ml-1 text-xs text-zinc-400">
            (가입 {v.converted}/{v.shown})
          </span>
        </span>
      </div>
      {/* 이 variant가 실제 무엇인지 — 직원도 이해 */}
      <p className="ml-44 mt-0.5 pl-3 text-xs leading-relaxed text-zinc-500">{v.description}</p>
    </div>
  )
}

// 가입자 리텐션 셀 — 재방문율% + (재방문/성숙표본). 성숙 0이면 '—'(신뢰불가), 5명 미만 흐리게.
function RetCell({ d }: { d: RetDay }) {
  if (d.rate === null) return <td className="px-2 py-2 text-right text-zinc-300">—</td>
  return (
    <td className="px-2 py-2 text-right">
      <span className={d.matured < 5 ? 'text-zinc-400' : 'font-medium text-zinc-800'}>
        {d.rate}%<br /><span className="text-[10px] font-normal text-zinc-400">{d.returned}/{d.matured}</span>
      </span>
    </td>
  )
}

// 그룹 1개 = 헤더행(배정·가입·전환율·비회원) + 가입자 행(userId) + 비회원 행(세션)
function GateGroupRows({ r }: { r: GateITTRow }) {
  return (
    <>
      <tr className="bg-zinc-50/80">
        <td colSpan={8} className="px-3 py-1.5 text-xs font-bold text-zinc-700">
          {r.label} · 배정 {r.assignedCount}명 · 가입 {r.signupCount}명{r.signupRate !== null && <span className="font-normal text-zinc-400"> ({r.signupRate}%)</span>} · 비회원 {r.guestCount}명
        </td>
      </tr>
      <tr className="border-t border-zinc-50">
        <td className="whitespace-nowrap px-3 py-1.5 text-left text-xs font-semibold text-emerald-700">가입자 ★ (회원번호)</td>
        {r.retention.map((d) => <RetCell key={d.d} d={d} />)}
      </tr>
      <tr className="border-t border-zinc-50">
        <td className="whitespace-nowrap px-3 py-1.5 text-left text-xs text-sky-700">비회원 (둘러보기)</td>
        {r.guestRetention.map((d) => <RetCell key={d.d} d={d} />)}
      </tr>
    </>
  )
}

// 게이트 리텐션 카드 — 가입자(회원번호) + 비회원(세션) 재방문 D1~D7. 둘 다 코호트 보정.
//   딥다이브 검증(2026-06-15): 통합·전환율 같은 sessionId 부풀림 지표는 제거. 가입자=가장 정확,
//   비회원=OAuth 미경유라 세션 안정적(가입자 다음 신뢰). 상세: docs/analysis/twa-gate-final-verify-*.
function GateITTCard({ exp, itt }: { exp: WebExperimentView; itt: GateITTResult }) {
  const totalAssigned = itt.rows.reduce((s, r) => s + r.assignedCount, 0)
  const started = itt.firstAssignedAt ? new Date(itt.firstAssignedAt).toLocaleDateString('ko-KR') : null
  const d7Trust = itt.firstAssignedAt
    ? new Date(new Date(itt.firstAssignedAt).getTime() + 7 * 86400000).toLocaleDateString('ko-KR')
    : null
  return (
    <div className="rounded-xl border border-[#FF6F61]/30 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">✅ 가입자 + 비회원 리텐션</span>
        <h2 className="text-base font-bold text-zinc-900">{exp.name} — 재방문 (D1~D7)</h2>
      </div>
      <p className="mb-3 rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
        그룹(A·B·C)별로 <b className="text-emerald-700">가입한 회원</b>과 <b className="text-sky-700">가입 안 한 비회원(둘러보기)</b>이 며칠에 다시 오는지 봅니다. 비회원도 우리의 중요한 잠재 회원이니 함께 봅니다. <b className="text-emerald-700">가입자</b>는 회원번호라 가장 정확하고, <b className="text-sky-700">비회원</b>은 카카오 로그인을 안 거쳐 세션이 안정적이라 그다음으로 신뢰할 수 있습니다.
      </p>
      {totalAssigned === 0 ? (
        <div className="rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          📭 아직 배정 데이터가 없습니다. 신규 TWA 진입자가 쌓이면 자동으로 채워집니다.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">그룹 / 종류</th>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <th key={n} className="px-2 py-2 text-right font-medium">D{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itt.rows.map((r) => (
                  <GateGroupRows key={r.variant} r={r} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            · 각 칸 = 재방문율% + (재방문수/<b>성숙표본</b>). <b>성숙표본</b>=가입·배정 후 그 일수가 <b>실제로 지난 사람만</b> 분모(안 지난 사람을 넣으면 가짜로 낮게 나옴). 5명 미만 흐리게, 0명은 <b>&lsquo;—&rsquo;</b>(신뢰 불가).
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            · <b className="text-emerald-700">가입자</b>=가입 회원이 다시 옴(회원번호, 가장 정확) · <b className="text-sky-700">비회원</b>=끝까지 가입 안 하고 둘러본 세션(OAuth 미경유라 세션 안정적·참고로 신뢰). 둘 다 코호트 보정 적용.
          </p>
          {(started || d7Trust) && (
            <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs leading-relaxed text-sky-800">
              📅 측정 시작 <b>{started}</b>. 리텐션은 그 일수가 지나야 채워집니다 — <b>D7은 {d7Trust} 이후</b>부터 신뢰 가능(그 전엔 &lsquo;—&rsquo; 또는 흐리게). D1~D3은 지금도 신뢰 가능합니다.
            </p>
          )}
          {totalAssigned < 30 && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
              ⚠️ 배정 {totalAssigned}건 — 표본이 적어 아직 방향성 참고용. 더 쌓이면 자동 갱신됩니다.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ExperimentCard({ exp }: { exp: WebExperimentView }) {
  const maxRate = Math.max(...exp.variants.map((v) => v.rate), 0)
  const enough = exp.confidence !== 'insufficient'
  const conf = CONFIDENCE_META[exp.confidence]
  const isWinnerCard = exp.status !== 'CONCLUDED' && exp.status !== 'DRAFT'
  return (
    <div
      className={`rounded-xl border bg-white p-5 ${
        isWinnerCard ? 'border-[#FF6F61]/30' : 'border-zinc-200'
      }`}
    >
      {/* 헤더 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={exp.status} />
        <h2 className="text-base font-bold text-zinc-900">{exp.name}</h2>
        <span className="text-xs text-zinc-400">담당 {exp.owner}</span>
      </div>

      {/* 설명 (직원이 읽고 이해) */}
      <dl className="mb-4 space-y-1.5 rounded-lg bg-zinc-50 p-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">🎯 목적</dt>
          <dd className="text-zinc-800">{exp.purpose}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">📌 배경</dt>
          <dd className="text-zinc-700">{exp.background}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">💡 가설</dt>
          <dd className="text-zinc-700">{exp.hypothesis}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">🔍 확인</dt>
          <dd className="text-zinc-600">{exp.howToVerify}</dd>
        </div>
      </dl>

      {/* variant 성과 */}
      <div className="space-y-0.5">
        {exp.variants.map((v) => (
          <VariantRow key={v.key} v={v} maxRate={maxRate} enough={enough} />
        ))}
      </div>

      {/* 신뢰도 + 안내 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${conf.cls}`}>{conf.label}</span>
        <span className="text-xs text-zinc-500">{conf.hint}</span>
      </div>

      {/* 운영 메모/결론 표시 */}
      {exp.note && (
        <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800">📝 {exp.note}</p>
      )}
      {exp.conclusion && (
        <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-800">✅ 결론: {exp.conclusion}</p>
      )}

      {/* 운영 편집 (상태·담당·메모·결론) */}
      <ExperimentStatePanel
        experimentId={exp.id}
        status={exp.status}
        owner={exp.owner}
        note={exp.note}
        conclusion={exp.conclusion}
      />
    </div>
  )
}

export default async function AdminAbTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const sp = await searchParams
  const period = sp.period ?? '30'
  const days = PERIOD_DAYS[period] ?? 30
  const [experiments, gateITT] = await Promise.all([
    getWebExperiments(days),
    getGateITT(90),
  ])

  // 게이트 실험은 funnel(전환율)이 아니라 재방문 지표로 별도 표시 → web 펀넬 목록에서 분리
  const gateExp = experiments.find((e) => e.id === 'twa01_entry_gate')
  const webExperiments = experiments.filter((e) => e.id !== 'twa01_entry_gate')
  const active = webExperiments.filter((e) => e.status !== 'CONCLUDED')
  const concluded = webExperiments.filter((e) => e.status === 'CONCLUDED')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">🧪 웹 A/B 테스트</h1>
          <p className="mt-1 text-sm text-zinc-500">
            화면·문구·타이밍 실험의 variant별 가입 전환을 비교합니다. (봇 제외 · sessionId 기준)
          </p>
        </div>
        <PeriodFilter />
      </div>

      {/* 메인 지표: 가입자 리텐션 (딥다이브 검증 결과 유일하게 신뢰 가능한 지표) */}
      {gateExp && <GateITTCard exp={gateExp} itt={gateITT} />}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-zinc-400">진행 중</h2>
          {active.map((exp) => (
            <ExperimentCard key={exp.id} exp={exp} />
          ))}
        </section>
      )}

      {concluded.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-zinc-400">종료</h2>
          {concluded.map((exp) => (
            <ExperimentCard key={exp.id} exp={exp} />
          ))}
        </section>
      )}
    </div>
  )
}
