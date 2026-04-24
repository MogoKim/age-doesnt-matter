import type { Metadata } from 'next'
import Link from 'next/link'
import { getDailyBrief, getDailyBriefs } from '@/lib/queries/admin'

export const metadata: Metadata = { title: '욕망 지도' }
export const dynamic = 'force-dynamic'

const DESIRE_LABELS: Record<string, string> = {
  HEALTH: '🏥 건강불안',
  MONEY: '💰 경제불안',
  RELATION: '🤝 연결갈망',
  RETIRE: '🌅 인생2막',
  JOB: '💼 일자리',
  MEANING: '✨ 삶의의미',
  HOBBY: '🎨 취미여가',
  FAMILY: '👨‍👩‍👧 가족관계',
  EMOTION: '💬 감정공감',
  INFO: '📖 정보수집',
}

const EMOTION_LABELS: Record<string, string> = {
  LONELY: '외로움',
  ANXIOUS: '불안함',
  HOPEFUL: '기대감',
  NOSTALGIC: '그리움',
  CURIOUS: '호기심',
  GRATEFUL: '감사함',
  FRUSTRATED: '답답함',
  PROUD: '뿌듯함',
}

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function DailyBriefPage({ searchParams }: Props) {
  const params = await searchParams
  const selectedDate = params.date ? new Date(params.date) : new Date()

  const [brief, recentBriefs] = await Promise.all([
    getDailyBrief(selectedDate),
    getDailyBriefs(7),
  ])

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div className="space-y-6">
      {/* 날짜 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {recentBriefs.map((b) => {
          const dateStr = new Date(b.date).toISOString().slice(0, 10)
          const isActive = params.date === dateStr || (!params.date && dateStr === new Date().toISOString().slice(0, 10))
          return (
            <Link
              key={b.id}
              href={`/admin/daily-brief?date=${dateStr}`}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium no-underline transition-colors ${
                isActive
                  ? 'bg-[#FF6F61] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {formatDate(b.date)}
            </Link>
          )
        })}
      </div>

      {!brief ? (
        <div className="py-16 text-center text-sm text-zinc-400">
          선택한 날짜의 욕망 지도 데이터가 없습니다.<br />
          <span className="text-xs text-zinc-300">매일 오전 크롤링 파이프라인 완료 후 생성됩니다.</span>
        </div>
      ) : (
        <>
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400">
                {new Date(brief.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                {' · '}{brief.mode === 'deep' ? '🔍 딥 분석' : '⚡ 퀵 업데이트'}
              </div>
            </div>
          </div>

          {/* 섹션 1: 지배 욕망 + 감정 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border-2 border-[#FF6F61]/20 bg-[#FF6F61]/5 p-5">
              <div className="mb-1 text-xs font-medium text-zinc-400">오늘의 지배 욕망</div>
              <div className="text-2xl font-bold text-[#FF6F61]">
                {brief.dominantDesire
                  ? (DESIRE_LABELS[brief.dominantDesire] ?? brief.dominantDesire)
                  : '—'}
              </div>
            </div>
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5">
              <div className="mb-1 text-xs font-medium text-zinc-400">오늘의 지배 감정</div>
              <div className="text-2xl font-bold text-blue-700">
                {brief.dominantEmotion
                  ? (EMOTION_LABELS[brief.dominantEmotion] ?? brief.dominantEmotion)
                  : '—'}
              </div>
            </div>
          </div>

          {/* 섹션 2: 욕망 순위 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-zinc-900">📊 욕망 순위</h2>
            <div className="space-y-3">
              {(brief.desireRanking as Array<{ category: string; percent: number; label: string }>)
                .slice(0, 5)
                .map((item, i) => (
                  <div key={item.category} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm font-bold text-zinc-400">
                      {i + 1}
                    </span>
                    <span className="w-28 text-sm text-zinc-700">
                      {DESIRE_LABELS[item.category] ?? item.label}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-2 rounded-full bg-[#FF6F61] transition-all"
                        style={{ width: `${Math.min(item.percent, 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-medium text-zinc-600">
                      {item.percent}%
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* 섹션 3: 페르소나 쿼터 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-zinc-900">👥 페르소나별 배분</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="pb-2 text-left font-medium text-zinc-500">페르소나</th>
                    <th className="pb-2 text-center font-medium text-zinc-500">쿼터 배율</th>
                    <th className="pb-2 text-center font-medium text-zinc-500">욕망 매칭</th>
                    <th className="pb-2 text-left font-medium text-zinc-500">주제 힌트</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {Object.entries(
                    brief.personaQuotas as Record<
                      string,
                      { desireAlignment: number; quotaMultiplier: number; topicHint: string; shouldBoost: boolean }
                    >
                  ).map(([personaId, quota]) => (
                    <tr key={personaId} className="py-2">
                      <td className="py-2 font-medium text-zinc-900">{personaId}</td>
                      <td className="py-2 text-center">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          quota.quotaMultiplier >= 1.5
                            ? 'bg-green-50 text-green-700'
                            : quota.quotaMultiplier <= 0.7
                            ? 'bg-red-50 text-red-700'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}>
                          ×{quota.quotaMultiplier.toFixed(1)}
                        </span>
                        {quota.shouldBoost && (
                          <span className="ml-1 text-xs text-[#FF6F61]">🔥</span>
                        )}
                      </td>
                      <td className="py-2 text-center text-zinc-600">
                        {Math.round(quota.desireAlignment * 100)}%
                      </td>
                      <td className="py-2 text-zinc-500">{quota.topicHint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 섹션 4: 긴급 토픽 */}
          {(brief.urgentTopics as Array<{ topic: string; urgencyAvg: number; count: number; psychInsight: string }>).length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-bold text-zinc-900">🔥 긴급 토픽</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {(brief.urgentTopics as Array<{ topic: string; urgencyAvg: number; count: number; psychInsight: string }>)
                  .slice(0, 6)
                  .map((t, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-zinc-900">{t.topic}</span>
                        <span className="text-xs text-zinc-400">{t.count}건</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{t.psychInsight}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 섹션 5: contentDirective */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-zinc-900">📋 에이전트 공통 지시사항</h2>
            <pre className="overflow-auto rounded-lg bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700">
              {JSON.stringify(brief.contentDirective, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
