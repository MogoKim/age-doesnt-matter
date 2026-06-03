import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { getTrendingCommunityPosts, getPostsByBoardPage } from '@/lib/queries/posts'
import type { BoardType } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { formatTimeAgo } from './utils'

const getCachedBoardBottomPosts = unstable_cache(
  async (boardType: BoardType) => (await getPostsByBoardPage(boardType, { limit: 13 })).posts,
  ['post-list-bottom-latest'],
  { revalidate: 30, tags: ['community-board-page'] },
)

interface Props {
  boardType: BoardType
  boardSlug: string
  excludePostId: string
  displayName: string
  mode: 'trending' | 'latest'
}

export default async function PostListBottom({ boardType, boardSlug, excludePostId, displayName, mode }: Props) {
  const rawPosts = mode === 'trending'
    ? await getTrendingCommunityPosts(13)
    : await getCachedBoardBottomPosts(boardType)

  const posts = rawPosts
    .filter(p => p.id !== excludePostId)
    .slice(0, 12)

  if (posts.length === 0) return null

  const title = mode === 'trending' ? '지금 뜨는 다른 글' : `${displayName} 다른 글`
  const moreHref = mode === 'trending' ? '/best' : `/community/${boardSlug}`
  const moreLabel = mode === 'trending' ? '베스트 →' : '목록 →'

  return (
    <section className="mt-2 mb-8">
      <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-foreground">
        <span className="text-title font-bold text-foreground">{title}</span>
        <Link
          href={moreHref}
          className="text-[17px] text-primary-text no-underline min-h-[52px] flex items-center px-2 hover:underline"
          prefetch={false}
        >
          {moreLabel}
        </Link>
      </div>
      <ol className="list-none m-0 p-0">
        {posts.map((post, idx) => (
          <li key={post.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              className="flex items-start gap-3 py-3 no-underline text-inherit min-h-[52px] hover:bg-muted/40 transition-colors -mx-1 px-1 rounded-lg"
              prefetch={false}
            >
              <span className="text-caption font-bold text-muted-foreground min-w-[24px] shrink-0 pt-0.5 text-right">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-foreground m-0 mb-1 line-clamp-2 leading-[1.5]">
                  {post.title}
                </p>
                <div className="flex items-center gap-2 text-caption text-muted-foreground">
                  <span>💬 {post.commentCount}</span>
                  <span>❤️ {post.likeCount}</span>
                  <span>· {formatTimeAgo(post.createdAt)}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
