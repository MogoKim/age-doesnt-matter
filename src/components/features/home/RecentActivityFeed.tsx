import Link from 'next/link'
import type { RecentActivity } from '@/lib/queries/posts'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { BoardType } from '@/generated/prisma/client'

interface Props {
  activities: RecentActivity[]
}

const ACTION_MAP: Record<string, { icon: string; verb: string }> = {
  comment: { icon: '💬', verb: '댓글을 남겼어요' },
  like: { icon: '❤️', verb: '공감했어요' },
  post: { icon: '✏️', verb: '새 글을 올렸어요' },
}

export default function RecentActivityFeed({ activities }: Props) {
  if (activities.length === 0) return null

  return (
    <section className="py-6 lg:py-8">
      <div className="px-4 lg:px-0 mb-4">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          🔔 지금 이 순간
        </h2>
        <p className="text-caption text-muted-foreground mt-1 m-0">
          회원들이 활발하게 소통하고 있어요
        </p>
      </div>
      <div className="px-4 lg:px-0 space-y-1">
        {activities.map((activity, idx) => {
          const { icon, verb } = ACTION_MAP[activity.type] ?? ACTION_MAP.post
          const slug = BOARD_TYPE_TO_SLUG[activity.boardType as BoardType] ?? 'stories'
          const href = activity.boardType === 'MAGAZINE'
            ? `/magazine/${activity.postId}`
            : `/community/${slug}/${activity.postId}`

          return (
            <Link
              key={`${activity.type}-${activity.postId}-${idx}`}
              href={href}
              className="flex items-center gap-3 py-2.5 no-underline text-inherit min-h-[44px] rounded-lg transition-colors hover:bg-muted/50 px-2 -mx-2"
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              <p className="text-sm text-foreground m-0 flex-1 min-w-0 line-clamp-1">
                <span className="font-medium">{activity.nickname}</span>
                <span className="text-muted-foreground">님이 </span>
                <span className="text-muted-foreground">{verb}</span>
              </p>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {activity.timeAgo}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
