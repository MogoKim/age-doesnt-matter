import type { Metadata } from 'next'
import type { ExperimentStatus } from '@/generated/prisma/client'
import { getSocialExperiments } from '@/lib/queries/admin'

export const metadata: Metadata = { title: 'SNS A/B 테스트' }
export const dynamic = 'force-dynamic'

const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, { label: string; className: string }> = {
  PLANNING: { label: '기획 중', className: 'bg-zinc-100 text-zinc-600' },
  ACTIVE: { label: '진행 중', className: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: '완료', className: 'bg-green-50 text-green-700' },
  ANALYZED: { label: '분석 완료', className: 'bg-purple-50 text-purple-700' },
}

function formatMaybeNumber(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(1)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n.toFixed(1)
  }
  return '—'
}

export default async function AdminExperimentsPage() {
  const experiments = await getSocialExperiments(50)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">📱 SNS A/B 테스트</h1>
        <p className="mt-1 text-sm text-zinc-500">
          소셜 채널 콘텐츠 실험의 가설·통제군/실험군·결과를 관리합니다.
        </p>
      </div>

      {experiments.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
          SNS 실험 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => {
            const badge = EXPERIMENT_STATUS_LABELS[exp.status]
            const results = exp.results as {
              controlAvg?: unknown
              testAvg?: unknown
              winner?: unknown
              delta?: unknown
            } | null
            return (
              <div key={exp.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-400">
                        {exp.weekNumber}주차
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="font-bold text-zinc-900">{exp.hypothesis}</h3>
                  </div>
                  <div className="shrink-0 text-right text-xs text-zinc-400">
                    <div>{new Date(exp.startDate).toLocaleDateString('ko-KR')} ~</div>
                    <div>{new Date(exp.endDate).toLocaleDateString('ko-KR')}</div>
                  </div>
                </div>

                <div className="mb-3 flex gap-4 text-xs">
                  <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-600">
                    변수: {exp.variable}
                  </span>
                  <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                    통제: {exp.controlValue}
                  </span>
                  <span className="rounded bg-[#FF6F61]/10 px-2 py-1 text-[#FF6F61]">
                    실험: {exp.testValue}
                  </span>
                </div>

                {results && (
                  <div className="mb-3 grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-zinc-50 p-3 text-center">
                      <div className="text-xs text-zinc-400">통제군 평균</div>
                      <div className="mt-1 text-lg font-bold text-zinc-700">
                        {formatMaybeNumber(results.controlAvg)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3 text-center">
                      <div className="text-xs text-zinc-400">실험군 평균</div>
                      <div className="mt-1 text-lg font-bold text-zinc-700">
                        {formatMaybeNumber(results.testAvg)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3 text-center">
                      <div className="text-xs text-zinc-400">승자</div>
                      <div className="mt-1 text-lg font-bold text-[#FF6F61]">
                        {typeof results.winner === 'string' ? results.winner : '—'}
                        {results.delta !== undefined && formatMaybeNumber(results.delta) !== '—' && (
                          <span className="ml-1 text-sm text-zinc-500">
                            (+{formatMaybeNumber(results.delta)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {exp.learnings && (
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="mb-1 text-xs font-medium text-blue-700">💡 인사이트</div>
                    <p className="text-sm text-blue-800">{exp.learnings}</p>
                  </div>
                )}

                {exp.nextAction && (
                  <div className="mt-2 text-xs text-zinc-500">
                    다음 액션:{' '}
                    <span className="font-medium text-zinc-700">{exp.nextAction}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
