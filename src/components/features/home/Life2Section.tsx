import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import { IconComment, IconHeart } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

export default function Life2Section({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-6 lg:py-8">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span>🌿</span>
          2막 준비
        </h2>
        <Link href="/community/life2" className="text-caption text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          더보기 →
        </Link>
      </div>
      <ul className="list-none m-0 px-4 lg:px-0">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              prefetch={false}
              className="block py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:active:mx-0 lg:active:px-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-background px-2 py-0.5 rounded text-caption text-muted-foreground font-medium">{post.category || '2막 준비'}</span>
                <span className="text-caption text-muted-foreground">{post.author.nickname}</span>
              </div>
              <p className="text-body text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep">{post.title}</p>
              <div className="flex items-center gap-2.5 text-caption text-muted-foreground">
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
