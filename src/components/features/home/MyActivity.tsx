import Link from 'next/link'

interface Props {
  todayPosts: number
  newComments: number
  receivedLikes: number
}

/**
 * MyActivity — 회원 전용 3-stat 활동 현황 그리드
 */
export default function MyActivity({ todayPosts, newComments, receivedLikes }: Props) {
  const stats = [
    { label: '오늘 내 글', value: todayPosts, href: '/my/posts', unit: '개' },
    { label: '새 댓글', value: newComments, href: '/my/comments', unit: '개' },
    { label: '받은 공감', value: receivedLikes, href: '/my/posts', unit: '개' },
  ]

  return (
    <section className="px-4 py-4 lg:px-0" aria-label="내 활동 현황">
      <h2 className="text-title font-bold text-foreground mb-3">나의 활동</h2>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl py-4 bg-card border border-border no-underline text-inherit hover:border-primary/30 active:scale-95 transition-all"
          >
            <span
              className="text-[28px] font-bold"
              style={{ color: 'var(--color-primary)' }}
            >
              {stat.value}
            </span>
            <span className="text-caption text-muted-foreground">{stat.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
