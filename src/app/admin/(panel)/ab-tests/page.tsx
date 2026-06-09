import type { Metadata } from 'next'
import { getWebExperiments, getTwaSignupRetention, getGateRetention } from '@/lib/queries/admin'
import type { WebExperimentView, VariantStat, TwaRetention, GateRetentionRow } from '@/lib/queries/admin/admin.experiments-web'
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

function TwaBaselineCard({ r }: { r: TwaRetention }) {
  const stats = [
    { label: 'TWA 가입자', value: `${r.signupCount}명`, sub: '' },
    { label: 'D1 재방문', value: `${r.d1ReturnRate}%`, sub: `${r.d1ReturnCount}/${r.signupCount}명` },
    { label: 'D7 재방문', value: `${r.d7ReturnRate}%`, sub: `${r.d7ReturnCount}/${r.signupCount}명` },
    { label: '첫 활동(글·댓글)', value: `${r.firstActionRate}%`, sub: `${r.firstActionCount}/${r.signupCount}명` },
  ]
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-bold text-zinc-900">📱 TWA 가입자 재방문 (현행 baseline)</h2>
      <p className="mt-1 text-xs text-zinc-500">
        게이트 실험 전 기준선 — 앱(TWA)으로 가입한 회원이 이후 앱으로 다시 오는가 (최근 90일 · 봇 제외)
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{s.value}</p>
            {s.sub && <p className="mt-0.5 text-xs text-zinc-400">{s.sub}</p>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        · D1=가입 후 48시간 내, D7=7일 내 앱 재방문(누적) · 첫활동=현재 글·댓글 1개+ 보유 · 대상=browser_env가 앱(twa-android)인 가입자
      </p>
      {r.signupCount < 20 && (
        <p className="mt-1 text-xs text-amber-600">⚠️ 표본 {r.signupCount}명 — 적어서 방향성 참고용(절대 수치 신뢰 보류)</p>
      )}
    </div>
  )
}

// 실험 메타(목적·배경·가설·확인) — 펀넬 카드와 게이트 카드 공용
function ExperimentMeta({ exp }: { exp: WebExperimentView }) {
  return (
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
  )
}

// 게이트 실험(twa01_entry_gate) 전용 카드 — funnel(전환율)이 아니라 그룹별 가입 후 재방문(D1/D7)으로 비교.
//  게이트 A(현행)는 노출 이벤트가 없어 funnel 분모가 0 → A가 0%로 오독됨. 그래서 게이트는 재방문 지표로만 본다.
function GateExperimentCard({ exp, rows }: { exp: WebExperimentView; rows: GateRetentionRow[] }) {
  const total = rows.reduce((s, r) => s + r.signupCount, 0)
  const isLive = exp.status !== 'CONCLUDED' && exp.status !== 'DRAFT'
  return (
    <div className={`rounded-xl border bg-white p-5 ${isLive ? 'border-[#FF6F61]/30' : 'border-zinc-200'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={exp.status} />
        <h2 className="text-base font-bold text-zinc-900">{exp.name}</h2>
        <span className="text-xs text-zinc-400">담당 {exp.owner}</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">📱 앱 재방문으로 측정</span>
      </div>

      <ExperimentMeta exp={exp} />

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">그룹</th>
              <th className="px-3 py-2 text-right font-medium">가입자</th>
              <th className="px-3 py-2 text-right font-medium">D1 재방문</th>
              <th className="px-3 py-2 text-right font-medium">D7 재방문</th>
              <th className="px-3 py-2 text-right font-medium">첫 활동</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variant} className="border-t border-zinc-100">
                <td className="px-3 py-2 font-medium text-zinc-700">{r.label}</td>
                <td className="px-3 py-2 text-right text-zinc-800">{r.signupCount}명</td>
                <td className="px-3 py-2 text-right text-zinc-800">{r.d1ReturnRate}% <span className="text-xs text-zinc-400">({r.d1ReturnCount}/{r.signupCount})</span></td>
                <td className="px-3 py-2 text-right text-zinc-800">{r.d7ReturnRate}% <span className="text-xs text-zinc-400">({r.d7ReturnCount}/{r.signupCount})</span></td>
                <td className="px-3 py-2 text-right text-zinc-800">{r.firstActionRate}% <span className="text-xs text-zinc-400">({r.firstActionCount}/{r.signupCount})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        A(현행·대조군) 대비 B·C가 <b>가입 후 앱 재방문(D1/D7)</b>을 높이는지가 핵심입니다.
        가입률(funnel)은 게이트 특성상 비교가 부적합해 제외했습니다. (최근 90일 · 봇 제외)
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        · 괄호 안 = 재방문/가입 <b>실제 명수</b>(%는 표본 작을 때 출렁이니 명수로 확인) · D1=가입 후 48시간 내, D7=7일 내 앱 재방문(누적, D7⊇D1)
        · 첫활동=현재 글·댓글 1개+ 보유 · 그룹 분류=가입 시 twa_gate_variant. 위 baseline(21명)은 게이트 무관 전체 TWA 가입자라 모수가 다름(직접 비교 주의)
      </p>
      {total < 30 && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          ⚠️ 전체 가입 {total}명 — 표본이 적어 아직 판단 보류(방향성 참고용). 데이터가 더 쌓이면 자동 갱신됩니다.
        </p>
      )}

      {exp.note && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800">📝 {exp.note}</p>}
      {exp.conclusion && <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-800">✅ 결론: {exp.conclusion}</p>}

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
  const [experiments, twaRetention, gateRetention] = await Promise.all([
    getWebExperiments(days),
    getTwaSignupRetention(90),
    getGateRetention(90),
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

      <TwaBaselineCard r={twaRetention} />

      {gateExp && <GateExperimentCard exp={gateExp} rows={gateRetention} />}

      {webExperiments.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-400">
          등록된 실험이 없습니다. <code className="text-zinc-500">src/lib/experiments/registry.ts</code>에 추가하세요.
        </div>
      )}

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
