import type { Metadata } from 'next'
import Link from 'next/link'
import { getHotPosts, getHallOfFamePosts } from '@/lib/queries/posts'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'

export const metadata: Metadata = {
  title: '인기글',
  description: '우나어 커뮤니티에서 가장 인기 있는 글 모음',
}

export const revalidate = 60

export default async function BestPage() {
  const [hotResult, fameResult] = await Promise.all([
    getHotPosts({ limit: 10 }),
    getHallOfFamePosts({ limit: 10 }),
  ])

  return (
    <div className="min-h-screen bg-background">
      {/* 실시간 인기글 */}
      <section className="px-4 py-6">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          🔥 실시간 인기글
        </h2>

        {hotResult.posts.length > 0 ? (
          <div className="space-y-3">
            {hotResult.posts.map((post) => (
              <BestPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState message="아직 인기글이 없어요. 글에 공감을 눌러보세요!" />
        )}
      </section>

      {/* 명예의 전당 */}
      <section className="px-4 py-6 border-t border-border">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          👑 명예의 전당
        </h2>

        {fameResult.posts.length > 0 ? (
          <div className="space-y-3">
            {fameResult.posts.map((post) => (
              <BestPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState message="공감 50개 이상 달성한 글이 명예의 전당에 올라가요!" />
        )}
      </section>
    </div>
  )
}

function BestPostCard({ post }: { post: PostSummary }) {
  const boardSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? 'stories'
  const boardLabel = post.boardType === 'STORY' ? '사는이야기' : '활력충전소'

  return (
    <Link
      href={`/community/${boardSlug}/${post.id}`}
      className="block p-4 bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[13px] font-bold">
          {boardLabel}
        </span>
        {post.promotionLevel === 'HOT' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-br from-[#FF6B6B] to-[#FF8E53] text-white">
            🔥 HOT
          </span>
        )}
        {post.promotionLevel === 'HALL_OF_FAME' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-br from-[#A855F7] to-[#EC4899] text-white">
            👑 FAME
          </span>
        )}
      </div>

      <h3 className="text-base font-bold text-foreground m-0 mb-1 line-clamp-2">
        {post.title}
      </h3>

      {post.preview && (
        <p className="text-sm text-muted-foreground m-0 line-clamp-1 leading-relaxed mb-2">
          {post.preview}
        </p>
      )}

      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span>{post.author.gradeEmoji} {post.author.nickname}</span>
        <span>❤️ {post.likeCount}</span>
        <span>💬 {post.commentCount}</span>
        <span>👁 {post.viewCount}</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
      <p className="text-base text-muted-foreground leading-relaxed">{message}</p>
    </div>
  )
}
