import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getBoardConfig } from '@/lib/queries/boards'
import { getPostsByBoardPage, getCachedBoardPage } from '@/lib/queries/posts'
import type { PostSummary } from '@/types/api'
import type { BoardType } from '@/generated/prisma/client'
import type { SearchField } from '@/lib/queries/posts/posts.base'
import BoardFilter from '@/components/features/community/BoardFilter'
import PostCard from '@/components/features/community/PostCard'
import SortToggle from '@/components/features/community/SortToggle'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'
import PwaInlineBanner from '@/components/common/PwaInlineBanner'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'

const LIMIT = 12

interface PageProps {
  params: Promise<{ boardSlug: string }>
  searchParams: Promise<{ category?: string; sort?: string; q?: string; sf?: string; page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug } = await params
  try {
    const board = await getBoardConfig(boardSlug)
    if (!board) return { title: '게시판' }
    return {
      title: board.displayName,
      description: board.description,
      alternates: { canonical: `/community/${boardSlug}` },
    }
  } catch {
    return { title: '게시판' }
  }
}

function getBoardFaqJsonLd(boardSlug: string): object | null {
  const faqs: Record<string, Array<{ q: string; a: string }>> = {
    stories: [
      { q: '50대 외로움 어떻게 극복하나요?', a: '우나어 사는이야기에서 비슷한 처지의 50·60대 분들과 일상을 나누면 외로움이 줄어들어요. 댓글 하나에도 "나만 그런 게 아니구나" 하는 위안이 됩니다.' },
      { q: '갱년기 감정 기복이 심한데 정상인가요?', a: '네, 50대 갱년기에 감정 기복은 매우 흔한 증상입니다. 호르몬 변화로 생기는 자연스러운 반응으로, 우나어 사는이야기에서 같은 경험을 나누는 분들을 만날 수 있어요.' },
      { q: '중년 부부 대화가 없어요, 어떻게 해야 할까요?', a: '은퇴 후 또는 자녀 독립 후 부부 대화가 줄어드는 것은 중장년 부부에서 흔한 문제입니다. 우나어 사는이야기 게시판에서 비슷한 상황의 분들이 경험과 해결 방법을 활발히 나누고 있어요.' },
    ],
    life2: [
      { q: '50대 퇴직 후 무엇을 해야 하나요?', a: '우나어 2막준비 게시판에서 퇴직 후 창업, 재취업, 취미 활동, 봉사 등 다양한 인생 2막 사례를 먼저 경험한 분들과 나눌 수 있습니다.' },
      { q: '은퇴 준비는 몇 살부터 시작해야 하나요?', a: '전문가들은 보통 50대 초반부터 은퇴 준비를 시작하길 권장합니다. 우나어 2막준비에서는 기초연금, 퇴직연금, 건강보험 등 실질적인 준비 방법을 경험자들에게 직접 물어볼 수 있어요.' },
      { q: '노후 준비를 혼자 하기 어려운데 어떻게 하나요?', a: '우나어 2막준비 게시판에는 노후 준비를 함께 고민하는 동료들이 있습니다. 재정 계획, 건강 관리, 새로운 도전 등 다양한 이야기를 나누며 혼자가 아님을 느낄 수 있어요.' },
    ],
    humor: [
      { q: '50대 60대가 공감하는 유머는 어디서 보나요?', a: '우나어 웃음방에는 우리 또래만 이해하는 일상 유머, 중년 생활의 공감 포인트가 가득합니다. 남편 퇴직 후 일상, 갱년기 증상, 폰 사용 실수담 등 웃으면서 공감할 수 있어요.' },
      { q: '중년 일상이 재미없어요, 어떻게 하면 될까요?', a: '우나어 웃음방에서 우리 또래가 올리는 공감 유머글을 보면 일상의 무게가 조금 가벼워져요. 비슷한 나이의 사람들이 같은 상황을 웃음으로 넘기는 것을 보면 기분이 나아집니다.' },
    ],
  }

  const items = faqs[boardSlug]
  if (!items) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

function PostListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl p-5 border border-border animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4 mb-3" />
          <div className="h-3 bg-muted rounded w-full mb-2" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}

interface PostListContainerProps {
  boardType: BoardType
  boardSlug: string
  category: string | undefined
  sortOption: 'latest' | 'likes'
  q: string | undefined
  sf: SearchField
  page: number
}

async function PostListContainer({ boardType, boardSlug, category, sortOption, q, sf, page }: PostListContainerProps) {
  const skip = (page - 1) * LIMIT

  let posts: PostSummary[]
  let total: number

  if (q || page > 1) {
    ;({ posts, total } = await getPostsByBoardPage(boardType, { category, sort: sortOption, skip, limit: LIMIT, q, sf }))
  } else {
    ;({ posts, total } = await getCachedBoardPage(boardType, category ?? 'all', sortOption))
  }

  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''
  const sortSuffix = sortOption === 'likes' ? '&sort=likes' : ''
  const categorySuffix = category && category !== '전체' ? `&category=${encodeURIComponent(category)}` : ''

  if (posts.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <div className="text-[56px] mb-4">📝</div>
          <p className="text-sm text-muted-foreground leading-[1.8]">
            {q ? `"${q}" 검색 결과가 없어요.` : '아직 작성된 글이 없어요.'}<br />
            {q ? '다른 검색어를 입력해 보세요.' : '첫 번째 글을 남겨보세요!'}
          </p>
        </div>
        <BoardPaginationFooter
          total={total}
          page={page}
          pageSize={LIMIT}
          buildHref={(p) => `/community/${boardSlug}?page=${p}${sortSuffix}${categorySuffix}${qSuffix}`}
        />
      </>
    )
  }

  return (
    <>
      <PostListWithAds
        items={posts}
        renderCard={(post) => <PostCard post={post} boardSlug={boardSlug} />}
        className="space-y-3"
      />
      <BoardPaginationFooter
        total={total}
        page={page}
        pageSize={LIMIT}
        buildHref={(p) => `/community/${boardSlug}?page=${p}${sortSuffix}${categorySuffix}${qSuffix}`}
      />
    </>
  )
}

// searchParams 사용으로 dynamic rendering 필수 (DYNAMIC_SERVER_USAGE 방지)
export const dynamic = 'force-dynamic'

export default async function BoardListPage({ params, searchParams }: PageProps) {
  const { boardSlug } = await params
  const { category, sort, q: rawQ, sf: rawSf, page: rawPage } = await searchParams

  const board = await getBoardConfig(boardSlug)
  if (!board) notFound()

  const q = rawQ?.trim() || undefined
  const sf = rawSf === 'title' || rawSf === 'content' ? rawSf : ('both' as const)
  const sortOption = sort === 'likes' ? ('likes' as const) : ('latest' as const)
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)

  const boardFaqJsonLd = getBoardFaqJsonLd(boardSlug)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: '홈', path: '/' },
    { name: board.displayName, path: `/community/${boardSlug}` },
  ])

  return (
    <div className="max-w-[960px] mx-auto px-4 pt-4 pb-6 md:px-6 md:pt-4 md:pb-8">
      {boardFaqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(boardFaqJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* GA4 게시판 조회 이벤트 */}
      <BoardViewTracker boardType={board.boardType} boardSlug={boardSlug} />
      <h1 className="sr-only">{board.displayName}</h1>

      {/* PWA 인라인 배너 (미설치 + 비차단 환경에서만 노출) */}
      <PwaInlineBanner />

      {/* 카테고리 필터 + 정렬 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        {board.categories.length > 1 && (
          <Suspense fallback={null}>
            <BoardFilter categories={board.categories} boardSlug={boardSlug} />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <SortToggle />
        </Suspense>
      </div>

      {/* 게시글 목록 + 페이지네이션 + 검색 — 스트리밍 */}
      <Suspense fallback={<PostListSkeleton />}>
        <PostListContainer
          boardType={board.boardType}
          boardSlug={boardSlug}
          category={category}
          sortOption={sortOption}
          q={q}
          sf={sf}
          page={page}
        />
      </Suspense>
    </div>
  )
}
