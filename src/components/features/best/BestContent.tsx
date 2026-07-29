'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { PostSummary } from '@/types/api'
import PostCard from '@/components/features/community/PostCard'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'
import ScrollableChipRow from '@/components/ui/ScrollableChipRow'
import { chipClassName } from '@/components/ui/Chip'
import EmptyState from '@/components/ui/EmptyState'

const LIMIT = 12
const SHOW_BEST_SUBTABS = false

type TabType = 'hot' | 'fame'
const TABS: Array<{ key: TabType; label: string; emoji: string }> = [
  { key: 'hot',  label: '뜨는 이야기', emoji: '🔥' },
  { key: 'fame', label: '명예의 전당',  emoji: '👑' },
]

interface BestContentProps {
  initialPosts: PostSummary[]
  initialTotal: number
}

export default function BestContent({ initialPosts, initialTotal }: BestContentProps) {
  const searchParams = useSearchParams()
  const currentTab = (TABS.find((t) => t.key === searchParams.get('tab'))?.key ?? 'hot') as TabType
  const q = searchParams.get('q')?.trim() || undefined
  const sfParam = searchParams.get('sf')
  const sf = sfParam === 'both' || sfParam === 'content' ? sfParam : 'title'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const isDefaultView = currentTab === 'hot' && page === 1 && !q

  const [posts, setPosts] = useState<PostSummary[]>(initialPosts)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)

  const queryKey = useMemo(
    () => `${currentTab}:${page}:${q ?? ''}:${sf}`,
    [currentTab, page, q, sf],
  )

  useEffect(() => {
    if (isDefaultView) {
      setPosts(initialPosts)
      setTotal(initialTotal)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          type: currentTab,
          limit: String(LIMIT),
          skip: String((page - 1) * LIMIT),
        })
        if (q) {
          params.set('q', q)
          params.set('sf', sf)
        }
        const response = await fetch(`/api/best?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('failed')
        const result = await response.json() as { posts?: PostSummary[]; total?: number }
        setPosts(result.posts ?? [])
        setTotal(result.total ?? 0)
      } catch {
        if (!controller.signal.aborted) {
          setPosts([])
          setTotal(0)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [queryKey, currentTab, initialPosts, initialTotal, isDefaultView, page, q, sf])

  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''

  return (
    <>
      {SHOW_BEST_SUBTABS && (
        <nav className="max-w-[960px] mx-auto px-4 pt-4 pb-2">
          <ScrollableChipRow innerClassName="pb-1" fade={false}>
            {TABS.map((tab) => (
              <Link
                key={tab.key}
                href={`/best?tab=${tab.key}${qSuffix}`}
                className={chipClassName({
                  active: currentTab === tab.key,
                  tone: 'solid',
                  className: 'no-underline',
                })}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </Link>
            ))}
          </ScrollableChipRow>
        </nav>
      )}

      <section className="max-w-[960px] mx-auto px-4 pb-8">
        {loading ? (
          <BestListSkeleton />
        ) : posts.length > 0 ? (
          <PostListWithAds
            items={posts}
            renderCard={(post) => (
              <PostCard
                post={post}
                boardSlug={BOARD_TYPE_TO_SLUG[post.boardType] ?? 'stories'}
                showBoardBadge={true}
              />
            )}
          />
        ) : currentTab === 'fame' && !q ? (
          <FameEmptyState />
        ) : (
          <EmptyState
            message={q ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.` : getEmptyMessage(currentTab)}
          >
            {q && (
              <Link
                href={`/best?tab=${currentTab}`}
                className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-primary px-6 py-2 text-center text-body font-bold leading-tight break-keep text-white no-underline hover:bg-primary/90"
              >
                검색 초기화
              </Link>
            )}
          </EmptyState>
        )}

        {!loading && (
          <BoardPaginationFooter
            total={total}
            page={page}
            pageSize={LIMIT}
            buildHref={(p) => `/best?tab=${currentTab}&page=${p}${qSuffix}`}
          />
        )}
      </section>
    </>
  )
}

/** 목록 행 스켈레톤 — PostCard 실제 행 구조(제목/preview 2줄/메타/통계)와 높이를 맞춘다. */
function BestListSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border-b border-border py-4 last:border-b-0 animate-pulse">
          {/* 제목 1줄 */}
          <div className="h-[27px] w-3/4 rounded bg-muted" />
          {/* preview 2줄 */}
          <div className="h-[46px] w-full rounded bg-muted mt-2" />
          {/* 메타(보드배지·작성자·시간) */}
          <div className="h-[26px] w-2/3 rounded bg-muted mt-2.5" />
          {/* 통계(공감·댓글·조회) */}
          <div className="h-[26px] w-1/3 rounded bg-muted mt-2" />
        </div>
      ))}
    </div>
  )
}

function getEmptyMessage(tab: TabType): string {
  if (tab === 'hot') return '아직 뜨는 이야기가 없어요. 인기글에 공감을 눌러보세요!'
  return '아직 명예의 전당 글이 없어요.'
}

function FameEmptyState() {
  return (
    <EmptyState
      icon="👑"
      title="아직 명예의 전당이 비어있어요!"
      message={
        <>
          공감 + 댓글 합계 30개를 달성한 글이 이곳에 입성합니다.<br />
          지금 인기글에 공감을 눌러보세요! 🔥
        </>
      }
    >
      <Link
        href="/best?tab=hot"
        className="inline-flex min-h-[52px] items-center gap-1.5 rounded-xl bg-primary px-6 py-2 text-center text-base font-bold leading-tight break-keep text-white no-underline transition-colors hover:bg-primary/90"
      >
        🔥 뜨는 이야기 보러가기 →
      </Link>
    </EmptyState>
  )
}
