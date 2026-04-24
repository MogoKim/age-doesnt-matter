import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'

interface Props {
  posts: PostSummary[]
}

export default function TrendingSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">🔥</span>
          지금 뜨는 이야기
        </h2>
        <Link href="/best" className="text-caption text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          더보기 →
        </Link>
      </div>
      <ol className="list-none m-0 px-4 lg:px-0">
        {posts.map((post, index) => (
          <li key={post.id}>
            <Link
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.id}`}
              className="flex items-start gap-3 py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:active:mx-0 lg:active:px-0"
            >
              <span className="text-body font-bold text-primary-text min-w-[24px] shrink-0 leading-[1.4]">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-body text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep">{post.title}</p>
                <div className="flex items-center gap-2.5 text-caption text-muted-foreground">
                  <span>💬 {post.commentCount}</span>
                  <span>❤️ {post.likeCount}</span>
                  <span className="bg-background px-2 py-0.5 rounded text-caption text-muted-foreground">{BOARD_DISPLAY_NAMES[post.boardType] ?? post.boardType}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
