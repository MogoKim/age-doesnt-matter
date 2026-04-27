/**
 * ActivityPulse — 회원/비회원 공용 실시간 커뮤니티 현황 표시
 * recentActivities가 있으면 실제 최근 글 표시, 없으면 정적 메시지 폴백
 */

import Link from 'next/link'

interface RecentActivity {
  title: string
  href: string
}

interface ActivityPulseProps {
  activeCount?: number
  recentActivities?: RecentActivity[]
}

const FALLBACK_PULSES = [
  { emoji: '💬', text: '지금 사는이야기에서 활발하게 소통 중이에요' },
  { emoji: '🌱', text: '2막 준비 정보를 나누는 분들이 많아요' },
  { emoji: '📖', text: '오늘의 매거진이 업데이트됐어요' },
]

export default function ActivityPulse({ activeCount = 0, recentActivities = [] }: ActivityPulseProps) {
  const hasRealData = recentActivities.length > 0

  return (
    <section className="py-4 px-4 lg:px-0">
      {activeCount > 0 && (
        <p className="text-caption text-muted-foreground mb-2 px-1">
          지금 이 시간 <span className="font-semibold text-foreground">{activeCount}개</span>의 글이 올라왔어요
        </p>
      )}
      <div className="flex flex-col gap-2">
        {hasRealData
          ? recentActivities.map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border no-underline hover:border-primary/30 transition-colors"
              >
                <span
                  className="shrink-0 w-2 h-2 rounded-full"
                  style={{
                    background: 'var(--pulse-dot-color)',
                    boxShadow: '0 0 0 4px var(--pulse-dot-glow)',
                  }}
                  aria-hidden="true"
                />
                <p className="text-caption text-foreground break-keep m-0 line-clamp-1">{item.title}</p>
              </Link>
            ))
          : FALLBACK_PULSES.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border"
              >
                <span
                  className="shrink-0 w-2 h-2 rounded-full"
                  style={{
                    background: 'var(--pulse-dot-color)',
                    boxShadow: '0 0 0 4px var(--pulse-dot-glow)',
                  }}
                  aria-hidden="true"
                />
                <span className="text-[15px]" aria-hidden="true">{item.emoji}</span>
                <p className="text-caption text-muted-foreground break-keep m-0">{item.text}</p>
              </div>
            ))}
      </div>
    </section>
  )
}
