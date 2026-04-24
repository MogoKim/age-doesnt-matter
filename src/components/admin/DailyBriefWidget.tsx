import Link from 'next/link'

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

interface DesireItem {
  category: string
  percent: number
  label: string
}

interface Props {
  dominantDesire: string | null
  dominantEmotion: string | null
  desireRanking: DesireItem[]
  date: Date
}

export default function DailyBriefWidget({ dominantDesire, dominantEmotion, desireRanking, date }: Props) {
  const top3 = desireRanking.slice(0, 3)

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900">
          🧠 오늘의 욕망 지도
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            {new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
          </span>
          <Link
            href="/admin/daily-brief"
            className="text-xs font-medium text-[#FF6F61] no-underline hover:underline"
          >
            전체 보기 →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 지배 욕망 */}
        <div className="col-span-1 rounded-lg bg-[#FF6F61]/5 p-3">
          <div className="mb-1 text-xs text-zinc-400">지배 욕망</div>
          <div className="text-sm font-bold text-[#FF6F61]">
            {dominantDesire ? (DESIRE_LABELS[dominantDesire] ?? dominantDesire) : '—'}
          </div>
        </div>

        {/* 욕망 순위 TOP3 */}
        {top3.map((item, i) => (
          <div key={item.category} className="col-span-1 rounded-lg bg-zinc-50 p-3">
            <div className="mb-1 text-xs text-zinc-400">#{i + 1}</div>
            <div className="mb-1 text-sm font-medium text-zinc-800">
              {DESIRE_LABELS[item.category] ?? item.label}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-[#FF6F61]"
                style={{ width: `${Math.min(item.percent, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-right text-xs text-zinc-500">{item.percent}%</div>
          </div>
        ))}
      </div>

      {dominantEmotion && (
        <div className="mt-3 text-xs text-zinc-400">
          지배 감정: <span className="font-medium text-zinc-600">{dominantEmotion}</span>
        </div>
      )}
    </section>
  )
}
