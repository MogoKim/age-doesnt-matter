'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { PostSummary } from '@/types/api'
import PostCard from '@/components/features/community/PostCard'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'

const LIMIT = 12

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
                  : 'bg-card border-2 border-border text-foreground hover:border-primary/30'
                }
              `}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

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
                fromParam="best"
              />
            )}
            className="space-y-3"
          />
        ) : currentTab === 'fame' && !q ? (
          <FameEmptyState />
        ) : (
          <EmptyState
            message={q ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.` : getEmptyMessage(currentTab)}
            ctaHref={q ? `/best?tab=${currentTab}` : undefined}
            ctaLabel={q ? '검색 초기화' : undefined}
          />
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

function BestListSkeleton() {
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

function getEmptyMessage(tab: TabType): string {
  if (tab === 'hot') return '아직 뜨는 이야기가 없어요. 인기글에 공감을 눌러보세요!'
  return '아직 명예의 전당 글이 없어요.'
}

function FameEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-2xl border-2 border-dashed border-border gap-4">
      <p className="text-4xl">👑</p>
      <div>
        <p className="text-body font-bold text-foreground mb-1">아직 명예의 전당이 비어있어요!</p>
        <p className="text-[17px] text-muted-foreground leading-relaxed">
          공감 + 댓글 합계 30개를 달성한 글이 이곳에 입성합니다.<br />
          지금 인기글에 공감을 눌러보세요! 🔥
        </p>
      </div>
      <Link
        href="/best?tab=hot"
        className="inline-flex min-h-[52px] items-center gap-1.5 rounded-xl bg-primary px-6 py-2 text-center text-base font-bold leading-tight break-keep text-white no-underline transition-colors hover:bg-primary/90"
      >
        🔥 뜨는 이야기 보러가기 →
      </Link>
    </div>
  )
}

function EmptyState({ message, ctaHref, ctaLabel }: { message: string; ctaHref?: string; ctaLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border">
      <p className="text-body text-muted-foreground leading-relaxed">{message}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-primary px-6 py-2 text-center text-body font-bold leading-tight break-keep text-white no-underline hover:bg-primary/90"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
