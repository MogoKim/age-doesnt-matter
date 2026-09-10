'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { PostSummary } from '@/types/api'
import type { SearchField } from '@/lib/queries/posts/posts.base'
import { formatTimeAgo } from '@/components/features/community/utils'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'
import EmptyState from '@/components/ui/EmptyState'
import SearchParamsBridge from '@/components/features/common/SearchParamsBridge'
import { normalizeClientQuery } from '@/lib/list-query'

const LIMIT = 12

interface MagazineContentProps {
  initialPosts: PostSummary[]
  initialTotal: number
  /** 서버가 이미 그려 준 쿼리(정규화). 같은 쿼리면 다시 가져오지 않는다. */
  initialQuery: string
}

interface MagazineResponse {
  posts: PostSummary[]
  total: number
}

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export default function MagazineContent({ initialPosts, initialTotal, initialQuery }: MagazineContentProps) {
  // 🔴 `useSearchParams()` 를 여기서 부르면 정적 렌더가 CSR 로 bail out 되어
  //    서버 HTML 에 목록이 통째로 빠진다(링크 0건). 다리로 받는다 — SearchParamsBridge 주석 참조.
  // 서버가 그린 쿼리로 시작한다 — 서버 HTML 과 hydration 첫 렌더가 같아야 #418 이 안 난다.
  const [rawQuery, setRawQuery] = useState(initialQuery)
  const handleQueryChange = useCallback((next: string) => { setRawQuery(normalizeClientQuery(next)) }, [])
  const searchParams = useMemo(() => new URLSearchParams(rawQuery), [rawQuery])
  const q = searchParams.get('q')?.trim() || undefined
  const sf = parseSearchField(searchParams.get('sf'))
  const category = searchParams.get('category') || undefined
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  // 서버가 이미 그린 화면이면 재조회하지 않는다.
  const isServerRendered = rawQuery === initialQuery

  const [data, setData] = useState<MagazineResponse>({
    posts: initialPosts,
    total: initialTotal,
  })
  const [isLoading, setIsLoading] = useState(false)

  const queryKey = useMemo(() => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (q) {
      params.set('q', q)
      params.set('sf', sf)
    }
    if (page > 1) params.set('page', String(page))
    return params.toString()
  }, [category, q, sf, page])

  useEffect(() => {
    if (isServerRendered) {
      setData({ posts: initialPosts, total: initialTotal })
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)

    fetch(`/api/magazine?${queryKey}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to fetch magazine posts: ${response.status}`)
        return response.json() as Promise<MagazineResponse>
      })
      .then((nextData) => setData(nextData))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('[MagazineContent] fetch failed', error)
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [initialPosts, initialTotal, isServerRendered, queryKey])

  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''
  const categorySuffix = category ? `&category=${encodeURIComponent(category)}` : ''


  const bridge = <SearchParamsBridge onChange={handleQueryChange} />
  if (isLoading) {
    // 로딩 중에도 다리를 유지한다 — 여기서 빼면 로딩 사이에 일어난 URL 변경(뒤로가기 포함)을 놓친다.
    return (
      <>
        {bridge}
        <div className="space-y-3 mt-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      </>
    )
  }

  if (data.posts.length === 0) {
    return (
      <>
        {bridge}
        <EmptyState
          className="mt-4"
          message={
            q
              ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.`
              : category
                ? `${category} 카테고리 매거진이 아직 없어요. 곧 올라올 거예요!`
                : '아직 매거진이 없어요. 곧 유익한 글이 올라올 거예요!'
          }
        >
          {(q || category) && (
            <Link
              href="/magazine"
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-primary px-6 py-2 text-center text-body font-bold leading-tight break-keep text-white no-underline hover:bg-primary/90"
            >
              {q ? '검색 초기화' : '전체 매거진 보기'}
            </Link>
          )}
        </EmptyState>
        <BoardPaginationFooter
          total={data.total}
          page={page}
          pageSize={LIMIT}
          buildHref={(p) => `/magazine?page=${p}${categorySuffix}${qSuffix}`}
        />
      </>
    )
  }

  return (
    <>
      {bridge}
      <PostListWithAds
        items={data.posts}
        renderCard={(post, index) => <MagazineCard post={post} priority={index < 2} />}
        className="space-y-3 mt-4"
      />
      <BoardPaginationFooter
        total={data.total}
        page={page}
        pageSize={LIMIT}
        buildHref={(p) => `/magazine?page=${p}${categorySuffix}${qSuffix}`}
      />
    </>
  )
}

function MagazineCard({ post, priority }: { post: PostSummary; priority?: boolean }) {
  return (
    <Link
      href={`/magazine/${post.slug ?? post.id}`}
      className="flex items-start gap-3 p-3 md:p-4 bg-card rounded-xl border border-border overflow-hidden no-underline transition-colors hover:border-primary/30 min-h-[52px]"
    >
      {post.thumbnailUrl ? (
        <div className="relative flex-shrink-0 w-28 h-24 rounded-lg overflow-hidden">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            className="object-cover"
            sizes="112px"
            priority={priority}
            fetchPriority={priority ? 'high' : undefined}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-28 h-24 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl">
          📖
        </div>
      )}
      <div className="flex-1 min-w-0">
        {post.category && (
          <span className="text-caption text-primary-strong font-bold mb-1 block">{post.category}</span>
        )}
        <p className="text-body font-bold text-foreground m-0 line-clamp-2 leading-snug">
          {post.title}
        </p>
        {post.preview && (
          <p className="text-body text-muted-foreground mt-1 m-0 line-clamp-2">{post.preview}</p>
        )}
        <p className="text-caption text-muted-foreground mt-1 m-0">
          {/* suppressHydrationWarning: 상대시각은 렌더 시점의 now 기준이라 서버 HTML 과
            hydration 시점 값이 다를 수 있다(예: "3시간 전" → "4시간 전").
            의도된 차이이므로 이 텍스트 노드에서만 경고를 끈다 — CommentItem 과 같은 처리(PR #357).
            ⚠️ 목록이 SSR 되기 전에는 드러나지 않던 문제다. 이 속성을 지우면 React #418 이 재발한다. */}
          👁 {post.viewCount} · <span suppressHydrationWarning>{formatTimeAgo(post.createdAt)}</span>
        </p>
      </div>
    </Link>
  )
}
