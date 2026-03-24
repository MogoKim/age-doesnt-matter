import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import { IconComment, IconHeart, IconStories } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

const BOARD_LABEL: Record<string, string> = {
  STORY: '사는이야기',
  HUMOR: '활력충전소',
  MAGAZINE: '매거진',
  WEEKLY: '수다방',
  JOB: '일자리',
}

export default function CommunitySection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-6 lg:py-8">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-primary"><IconStories size={22} /></span>
          소통 마당 최신
        </h2>
        <Link href="/community/stories" className="text-[15px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          더보기 →
        </Link>
      </div>
      <ul className="list-none m-0 px-4 lg:px-0">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.id}`}
              className="block py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:active:mx-0 lg:active:px-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-background px-2 py-0.5 rounded text-[15px] text-muted-foreground font-medium">{BOARD_LABEL[post.boardType] ?? post.boardType}</span>
                <span className="text-[15px] text-muted-foreground">{post.author.nickname}</span>
              </div>
              <p className="text-base text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep">{post.title}</p>
              <div className="flex items-center gap-2.5 text-[15px] text-muted-foreground">
                <span className="flex items-center gap-1"><IconComment size={14} /> {post.commentCount}</span>
                <span className="flex items-center gap-1"><IconHeart size={14} /> {post.likeCount}</span>
                <span>{formatTimeAgo(post.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
