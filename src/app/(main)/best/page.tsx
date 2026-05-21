import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { getAccumulatedHotPosts, getHallOfFamePosts } from '@/lib/queries/posts'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { PostSummary } from '@/types/api'
import PostCard from '@/components/features/community/PostCard'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'

export const metadata: Metadata = {
  title: '인기글',
  description: '우나어 커뮤니티에서 가장 인기 있는 글 모음',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/best` },
}

const LIMIT = 12

const getCachedHot = unstable_cache(
  () => getAccumulatedHotPosts({ limit: LIMIT }),
  ['best-hot-p1'],
  { revalidate: 60, tags: ['best-hot'] }
)
const getCachedFame = unstable_cache(
  () => getHallOfFamePosts({ limit: LIMIT }),
  ['best-fame-p1'],
  { revalidate: 60, tags: ['best-fame'] }
)

type TabType = 'hot' | 'fame'
const TABS: Array<{ key: TabType; label: string; emoji: string }> = [
  { key: 'hot',  label: '뜨는 이야기', emoji: '🔥' },
  { key: 'fame', label: '명예의 전당',  emoji: '👑' },
]

export default async function BestPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sf?: string; page?: string }>
}) {
  const params = await searchParams
  const currentTab = (TABS.find((t) => t.key === params.tab)?.key ?? 'hot') as TabType
  const q = params.q?.trim() || undefined
  const sf = (params.sf === 'both' || params.sf === 'content') ? params.sf : ('title' as const)
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const skip = (page - 1) * LIMIT

  let posts: PostSummary[]
  let total: number

  if (currentTab === 'hot') {
    const result = (page === 1 && !q)
      ? await getCachedHot().catch(() => ({ posts: [] as PostSummary[], total: 0 }))
      : await getAccumulatedHotPosts({ skip, limit: LIMIT, q, sf }).catch(() => ({ posts: [] as PostSummary[], total: 0 }))
    posts = result.posts
    total = result.total
  } else {
    const result = (page === 1 && !q)
      ? await getCachedFame().catch(() => ({ posts: [] as PostSummary[], total: 0 }))
      : await getHallOfFamePosts({ skip, limit: LIMIT, q, sf }).catch(() => ({ posts: [] as PostSummary[], total: 0 }))
    posts = result.posts
    total = result.total
  }

  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">인기글 — 우나어 베스트</h1>

      {/* 탭 네비게이션 */}
      <nav className="max-w-[960px] mx-auto px-4 pt-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/best?tab=${tab.key}${qSuffix}`}
              className={`
                flex items-center gap-1.5 px-4 py-3 rounded-full text-body font-bold
                no-underline transition-colors min-h-[52px] whitespace-nowrap flex-shrink-0
                ${currentTab === tab.key
                  ? 'bg-primary text-white border-2 border-primary'
                  : 'bg-card border-2 border-border text-muted-foreground hover:border-primary/30'
                }
              `}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* 게시글 목록 */}
      <section className="max-w-[960px] mx-auto px-4 pb-8">
        {posts.length > 0 ? (
          <PostListWithAds
            items={posts}
            renderCard={(post) => (
              <PostCard
                post={post}
                boardSlug={BOARD_TYPE_TO_SLUG[post.boardType] ?? 'stories'}
                showBoardBadge={true}
                fromParam="best"
              />
            )}
            className="space-y-3"
          />
        ) : currentTab === 'fame' && !q ? (
          <FameEmptyState />
        ) : (
          <EmptyState message={q ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.` : getEmptyMessage(currentTab)} />
        )}

        <BoardPaginationFooter
          total={total}
          page={page}
          pageSize={LIMIT}
          buildHref={(p) => `/best?tab=${currentTab}&page=${p}${qSuffix}`}
        />
      </section>
    </div>
  )
}

function getEmptyMessage(tab: TabType): string {
  if (tab === 'hot') return '아직 뜨는 이야기가 없어요. 인기글에 공감을 눌러보세요!'
  return '아직 명예의 전당 글이 없어요.'
}

function FameEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center bg-card rounded-2xl border-2 border-dashed border-border gap-4">
      <p className="text-4xl">👑</p>
      <div>
        <p className="text-body font-bold text-foreground mb-1">아직 명예의 전당이 비어있어요!</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          공감 + 댓글 합계 30개를 달성한 글이 이곳에 입성합니다.<br />
          지금 인기글에 공감을 눌러보세요! 🔥
        </p>
      </div>
      <Link
        href="/best?tab=hot"
        className="inline-flex items-center gap-1.5 h-[52px] px-6 rounded-xl bg-primary text-white font-bold text-base no-underline transition-colors hover:bg-primary/90"
      >
        🔥 뜨는 이야기 보러가기 →
      </Link>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
      <p className="text-body text-muted-foreground leading-relaxed">{message}</p>
    </div>
  )
}
