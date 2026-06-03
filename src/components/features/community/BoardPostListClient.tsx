'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { BoardType } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import type { SearchField } from '@/lib/queries/posts/posts.base'
import PostCard from '@/components/features/community/PostCard'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'

const LIMIT = 12

interface BoardPostListClientProps {
  boardSlug: string
  boardType: BoardType
  initialPosts: PostSummary[]
  initialTotal: number
}

interface BoardPostsResponse {
  posts: PostSummary[]
  total: number
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

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export default function BoardPostListClient({
  boardSlug,
  boardType: _boardType,
  initialPosts,
  initialTotal,
}: BoardPostListClientProps) {
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || undefined
  const sortOption = searchParams.get('sort') === 'likes' ? 'likes' : 'latest'
  const q = searchParams.get('q')?.trim() || undefined
  const sf = parseSearchField(searchParams.get('sf'))
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const isDefaultView = !category && sortOption === 'latest' && !q && page === 1

  const [data, setData] = useState<BoardPostsResponse>({
    posts: initialPosts,
    total: initialTotal,
  })
  const [isLoading, setIsLoading] = useState(false)

  const queryKey = useMemo(() => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (sortOption === 'likes') params.set('sort', sortOption)
    if (q) {
      params.set('q', q)
      params.set('sf', sf)
    }
    if (page > 1) params.set('page', String(page))
    return params.toString()
  }, [category, sortOption, q, sf, page])

  useEffect(() => {
    if (isDefaultView) {
      setData({ posts: initialPosts, total: initialTotal })
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams(queryKey)
    setIsLoading(true)

    fetch(`/api/community/${boardSlug}?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to fetch board posts: ${response.status}`)
        return response.json() as Promise<BoardPostsResponse>
      })
      .then((nextData) => setData(nextData))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('[BoardPostListClient] fetch failed', error)
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [boardSlug, initialPosts, initialTotal, isDefaultView, queryKey])

  const sortSuffix = sortOption === 'likes' ? '&sort=likes' : ''
  const categorySuffix = category && category !== '전체' ? `&category=${encodeURIComponent(category)}` : ''
  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''

  if (isLoading) return <PostListSkeleton />

  if (data.posts.length === 0) {
    const resetParams = [
      sortOption === 'likes' ? 'sort=likes' : '',
      category && category !== '전체' ? `category=${encodeURIComponent(category)}` : '',
    ].filter(Boolean).join('&')
    const searchResetHref = resetParams
      ? `/community/${boardSlug}?${resetParams}`
      : `/community/${boardSlug}`

    return (
      <>
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <div className="text-[56px]">📝</div>
          <p className="text-body text-muted-foreground leading-[1.8]">
            {q ? `"${q}" 검색 결과가 없어요.` : '아직 작성된 글이 없어요.'}<br />
            {q ? '다른 검색어를 입력해 보세요.' : '첫 번째 글을 남겨보세요!'}
          </p>
          {q ? (
            <Link
              href={searchResetHref}
              className="inline-flex items-center justify-center h-[52px] px-6 rounded-xl bg-primary text-white text-body font-bold no-underline hover:bg-primary/90"
            >
              검색 초기화
            </Link>
          ) : (
            <Link
              href={`/community/write?board=${encodeURIComponent(boardSlug)}`}
              className="inline-flex items-center justify-center h-[52px] px-6 rounded-xl bg-primary text-white text-body font-bold no-underline hover:bg-primary/90"
            >
              ✏️ 글쓰기
            </Link>
          )}
        </div>
        <BoardPaginationFooter
          total={data.total}
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
        items={data.posts}
        renderCard={(post) => <PostCard post={post} boardSlug={boardSlug} />}
        className="space-y-3"
      />
      <BoardPaginationFooter
        total={data.total}
        page={page}
        pageSize={LIMIT}
        buildHref={(p) => `/community/${boardSlug}?page=${p}${sortSuffix}${categorySuffix}${qSuffix}`}
      />
    </>
  )
}
