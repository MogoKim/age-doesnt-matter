import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { getDailyTrendingPosts, getWeeklyTrendingPosts, getHallOfFamePosts } from '@/lib/queries/posts'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import FeedAd from '@/components/ad/FeedAd'
import CoupangBanner from '@/components/ad/CoupangBanner'

export const metadata: Metadata = {
  title: '인기글',
  description: '우나어 커뮤니티에서 가장 인기 있는 글 모음',
}

const getCachedDaily = unstable_cache(
  () => getDailyTrendingPosts(10),
  ['best-daily'],
  { revalidate: 60 }
)
const getCachedWeekly = unstable_cache(
  () => getWeeklyTrendingPosts(10),
  ['best-weekly'],
  { revalidate: 60 }
)
const getCachedFame = unstable_cache(
  () => getHallOfFamePosts({ limit: 10 }),
  ['best-fame'],
  { revalidate: 60 }
)

type TabType = 'daily' | 'weekly' | 'fame'
const TABS: Array<{ key: TabType; label: string; emoji: string }> = [
  { key: 'daily', label: '오늘의 인기글', emoji: '🔥' },
  { key: 'weekly', label: '이번 주 인기글', emoji: '📈' },
  { key: 'fame', label: '명예의 전당', emoji: '👑' },
]

export default async function BestPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const currentTab = (TABS.find((t) => t.key === params.tab)?.key ?? 'daily') as TabType

  const [dailyPosts, weeklyPosts, fameResult] = await Promise.all([
    getCachedDaily(),
    getCachedWeekly(),
    getCachedFame(),
  ])

  const postsMap: Record<TabType, PostSummary[]> = {
    daily: dailyPosts,
    weekly: weeklyPosts,
    fame: fameResult.posts,
  }
  const posts = postsMap[currentTab]

  const emptyMessages: Record<TabType, string> = {
    daily: '오늘은 아직 인기글이 없어요. 글에 공감을 눌러보세요!',
    weekly: '이번 주 인기글이 아직 없어요. 좋은 글을 올려보세요!',
    fame: '공감 50개 이상 달성한 글이 명예의 전당에 올라가요!',
  }

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">인기글 — 우나어 베스트</h1>

      {/* 탭 네비게이션 */}
      <nav className="px-4 pt-4 pb-2">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/best?tab=${tab.key}`}
              className={`
                flex items-center gap-1.5 px-4 py-3 rounded-xl text-body font-bold
                no-underline transition-colors min-h-[52px]
                ${currentTab === tab.key
                  ? 'bg-primary text-white'
                  : 'bg-card border border-border text-muted-foreground hover:border-primary/30'
                }
              `}
            >
              <span>{tab.emoji}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.replace('오늘의 ', '').replace('이번 주 ', '')}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* 게시글 목록 */}
      <section className="px-4 py-4">
        <h2 className="text-title font-bold text-foreground mb-4 flex items-center gap-2">
          {TABS.find((t) => t.key === currentTab)?.emoji}{' '}
          {TABS.find((t) => t.key === currentTab)?.label}
        </h2>

        {posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((post, idx) => (
              <div key={post.id}>
                <BestPostCard post={post} />
                {idx === 2 && (
                  <div className="mt-3"><FeedAd /></div>
                )}
                {idx === 5 && (
                  <div className="mt-3"><CoupangBanner preset="mobile" className="rounded-2xl overflow-hidden" /></div>
                )}
                {idx === 8 && (
                  <div className="mt-3"><FeedAd /></div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message={emptyMessages[currentTab]} />
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
      className="block p-4 bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30 min-h-[52px]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-caption font-bold">
          {boardLabel}
        </span>
        {post.promotionLevel === 'HOT' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-bold bg-gradient-to-br from-[var(--gradient-hot-from)] to-[var(--gradient-hot-to)] text-white">
            🔥 HOT
          </span>
        )}
        {post.promotionLevel === 'HALL_OF_FAME' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-bold bg-gradient-to-br from-[var(--gradient-fame-from)] to-[var(--gradient-fame-to)] text-white">
            👑 FAME
          </span>
        )}
      </div>

      <h3 className="text-body font-bold text-foreground m-0 mb-1 line-clamp-2">
        {post.title}
      </h3>

      {post.preview && (
        <p className="text-sm text-muted-foreground m-0 line-clamp-1 leading-relaxed mb-2">
          {post.preview}
        </p>
      )}

      <div className="flex items-center gap-3 text-caption text-muted-foreground">
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
      <p className="text-body text-muted-foreground leading-relaxed">{message}</p>
    </div>
  )
}
