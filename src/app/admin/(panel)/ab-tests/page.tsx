import type { Metadata } from 'next'
import { getWebExperiments } from '@/lib/queries/admin'
import type { WebExperimentView, VariantStat } from '@/lib/queries/admin/admin.experiments-web'
import { getExperimentRetention } from '@/lib/queries/admin/admin.experiments-retention'
import type { ExperimentRetentionView } from '@/lib/queries/admin/admin.experiments-retention'
import type { Confidence } from '@/lib/experiments/stats'
import { getRelatedAlgoAbStats } from '@/lib/queries/admin/admin.experiments-related-algo'
import type { RelatedAlgoView } from '@/lib/queries/admin/admin.experiments-related-algo'
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

// 리텐션 주지표 패널 (exp1_related_flow): 3화면 도달률·D1·세션 page_view·inline 클릭.
// page_view 평균은 평균값이라 유의 배지 없음. AdSense RPM 은 variant 분리 불가 → 전체 수익 가드레일(여기 미표시).
function RetentionPanel({ data }: { data: ExperimentRetentionView }) {
  const conf3 = CONFIDENCE_META[data.reach3Confidence]
  const confD1 = CONFIDENCE_META[data.d1Confidence]
  return (
    <div className="rounded-xl border border-[#FF6F61]/30 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#FF6F61]/10 px-2.5 py-1 text-xs font-bold text-[#FF6F61]">📈 리텐션 주지표</span>
        <h2 className="text-base font-bold text-zinc-900">{data.experimentId}</h2>
      </div>
      <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        ⚖️ 이 실험은 <b>가입 전환이 아니라 3화면·D1·세션PV·inline 클릭</b>으로 판단합니다(가입 전환 카드는 표시하지 않음).
        <b>AdSense RPM 은 variant별 분리 불가</b> → 전체 수익 가드레일입니다.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        봇 제외 · sessionId 기준{data.startFrom ? ` · ${data.startFrom.slice(0, 10)}~` : ''}.
        세션 page_view 평균은 <b>광고 노출 기회 proxy</b>(평균이라 유의 배지 없음).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="py-1 text-left">variant</th>
              <th>노출</th><th>3화면</th><th>추가탐색</th><th>세션PV</th><th>inline클릭</th>
            </tr>
          </thead>
          <tbody>
            {data.variants.map((v) => (
              <tr key={v.key} className="border-t border-zinc-100">
                <td className="py-1.5 font-medium text-zinc-700">{v.key}</td>
                <td className="text-center">{v.exposed}</td>
                <td className="text-center"><b className="text-zinc-800">{v.reach3Rate}%</b><span className="text-xs text-zinc-400"> ({v.reach3}/{v.exposed})</span></td>
                <td className="text-center text-zinc-600">{v.exploreRate}%</td>
                <td className="text-center text-zinc-600">{v.avgPageviews}</td>
                <td className="text-center text-zinc-600">{v.inlineClicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* D1~D7 재방문 (성숙 코호트만) */}
      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-zinc-600">D1~D7 재방문 (성숙 코호트만 · 기준일 {data.todayKst} KST)</p>
        <p className="mb-2 text-xs leading-relaxed text-zinc-400">
          D1~D7은 각 날짜까지 관찰이 끝난 코호트만 분모에 포함합니다. 최근 노출은 아직 D2~D7 분모에 들어가지 않습니다(표본 대기). D1만 유의 검정, D2~D7은 참고 지표.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-1 text-left">variant</th>
                {Array.from({ length: 7 }, (_, i) => (
                  <th key={i}>D{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.variants.map((v) => (
                <tr key={v.key} className="border-t border-zinc-100">
                  <td className="py-1.5 font-medium text-zinc-700">{v.key}</td>
                  {v.retentionDays.map((d) => (
                    <td key={d.day} className="text-center">
                      {d.denom === 0 ? (
                        <span className="text-zinc-300">대기</span>
                      ) : (
                        <>
                          <b className="text-zinc-800">{d.rate}%</b>
                          <span className="block text-[10px] text-zinc-400">{d.returned}/{d.denom}</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${conf3.cls}`}>3화면 {conf3.label}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${confD1.cls}`}>D1 {confD1.label}</span>
        <span className="text-xs text-zinc-400">· D2~D7 참고 지표(유의 검정 없음)</span>
      </div>
      {data.variants.some((v) => v.lowRelated > 0) && (
        <p className="mt-2 text-xs text-zinc-400">※ 관련글 3개 미만 노출(별도 세그먼트): {data.variants.map((v) => `${v.key} ${v.lowRelated}`).join(' · ')}</p>
      )}
    </div>
  )
}

// 종료된 실험 — 관련글 추천 algo v1/v2(related_algo_v2, PR #30). registry/assign 이 아니라 algo_version 기반 집계.
// 2026-07-08 창업자 제품 결정으로 B(rec_v2) winner 채택 → 전 사용자 rec_v2 고정(코드 배포). 아래 표는 종료 시점까지의 누적 집계.
// 지표: 노출·인라인 클릭·CTR·네이버 next-page rate·네이버 PV/session.
function RelatedAlgoPanel({ data }: { data: RelatedAlgoView }) {
  const conf = CONFIDENCE_META[data.ctrConfidence]
  return (
    <div className="rounded-xl border border-[#FF6F61]/30 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">종료</span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">✅ B(rec_v2) 채택 · 전면 적용</span>
        <h2 className="text-base font-bold text-zinc-900">related_algo_v2 · 관련글 추천 알고리즘 v1/v2</h2>
      </div>
      <dl className="mb-3 space-y-1 rounded-lg bg-zinc-50 p-3 text-sm">
        <div className="flex gap-2"><dt className="w-8 shrink-0 font-bold text-zinc-500">A</dt><dd className="text-zinc-700">rec_v1 — 기존 추천(같은 보드 맥락×흥미도) · <span className="text-zinc-400">종료(미적용, rollback용 코드 보존)</span></dd></div>
        <div className="flex gap-2"><dt className="w-8 shrink-0 font-bold text-emerald-700">B</dt><dd className="text-zinc-700">rec_v2_2026-06-30 — 새 추천(키워드 가중↑·크로스보드) · <b className="text-emerald-700">winner, 전 사용자 적용</b></dd></div>
      </dl>
      <p className="mb-2 text-xs leading-relaxed text-zinc-500">
        봇/내부 제외 · sessionId 기준 · related_recommend_view / related_post_click 의 algo_version 으로 arm 판정{data.startFrom ? ` · ${data.startFrom}~` : ''}.
        <b>2026-07-08 종료</b> — 통계 유의성은 표본 부족(need_more)이었으나 창업자 제품 결정으로 B 채택. 이후 노출은 전부 rec_v2 로 기록됨. 아래는 종료 시점까지 누적치.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="py-1 text-left">arm</th>
              <th>노출</th><th>인라인클릭</th><th>CTR</th><th>네이버 next-page<span className="font-normal text-zinc-400">(노출세션)</span></th><th>네이버 PV/s</th>
            </tr>
          </thead>
          <tbody>
            {data.arms.map((a) => (
              <tr key={a.key} className="border-t border-zinc-100">
                <td className="py-1.5 font-medium text-zinc-700">{a.label}</td>
                <td className="text-center text-zinc-600">{a.shown}</td>
                <td className="text-center text-zinc-600">{a.inlineClicks}</td>
                <td className="text-center"><b className="text-zinc-800">{a.ctr}%</b></td>
                <td className="text-center text-zinc-600">{a.naverNextPageRate}%<span className="text-xs text-zinc-400"> ({a.naverSessions})</span></td>
                <td className="text-center text-zinc-600">{a.naverPvPerSession}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${conf.cls}`}>CTR {conf.label}</span>
        <span className="text-xs text-zinc-500">{data.ctrConfidence === 'insufficient' ? '아직 표본이 적어요 — 수집 중입니다.' : conf.hint}</span>
      </div>
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
  const experiments = await getWebExperiments(days)
  const retention = await getExperimentRetention('exp1_related_flow', days)
  const relatedAlgo = await getRelatedAlgoAbStats(days)

  // exp1_related_flow 는 가입 전환이 아니라 리텐션(RetentionPanel)으로 판단 → 기존 가입 전환 카드에서 제외.
  // (sign_up 엔 related_flow 가 안 실려 가입 전환율이 0/무의미하게 보이는 오해 방지)
  const cardExperiments = experiments.filter((e) => e.id !== 'exp1_related_flow')

  const active = cardExperiments.filter((e) => e.status !== 'CONCLUDED')
  const concluded = cardExperiments.filter((e) => e.status === 'CONCLUDED')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">🧪 웹 A/B 테스트</h1>
          <p className="mt-1 text-sm text-zinc-500">
            화면·문구·타이밍 실험의 variant별 성과를 비교합니다. (실험별 가입 전환 또는 리텐션 · 봇 제외 · sessionId 기준)
          </p>
        </div>
        <PeriodFilter />
      </div>

      {/* 진행 중 — related_algo_v2(현재 운영 실험) 최상단 + registry ACTIVE 카드 */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-400">진행 중</h2>
        <RelatedAlgoPanel data={relatedAlgo} />
        {active.map((exp) => (
          <ExperimentCard key={exp.id} exp={exp} />
        ))}
      </section>

      {/* 종료됨 — 기본 접힘. 과거 데이터 보존(삭제 안 함). exp1_related_flow 리텐션 + registry CONCLUDED 카드 */}
      {(retention || concluded.length > 0) && (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50/50">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-zinc-500 select-none">
            종료됨 ({(retention ? 1 : 0) + concluded.length}) · 펼쳐서 보기
          </summary>
          <div className="space-y-3 p-4 pt-0">
            {retention && <RetentionPanel data={retention} />}
            {concluded.map((exp) => (
              <ExperimentCard key={exp.id} exp={exp} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
