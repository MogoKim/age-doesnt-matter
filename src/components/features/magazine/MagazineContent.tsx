'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { PostSummary } from '@/types/api'
import type { SearchField } from '@/lib/queries/posts/posts.base'
import { formatTimeAgo } from '@/components/features/community/utils'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'

const LIMIT = 12

interface MagazineContentProps {
  initialPosts: PostSummary[]
  initialTotal: number
}

interface MagazineResponse {
  posts: PostSummary[]
  total: number
}

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export default function MagazineContent({ initialPosts, initialTotal }: MagazineContentProps) {
  const searchParams = useSearchParams()
  const q = searchParams.get('q')?.trim() || undefined
  const sf = parseSearchField(searchParams.get('sf'))
  const category = searchParams.get('category') || undefined
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const isDefaultView = !q && !category && page === 1

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
    if (isDefaultView) {
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
  }, [initialPosts, initialTotal, isDefaultView, queryKey])

  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''
  const categorySuffix = category ? `&category=${encodeURIComponent(category)}` : ''

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    )
  }

  if (data.posts.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-4">
          <p className="text-body text-muted-foreground leading-relaxed">
            {q
              ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.`
              : category
                ? `${category} 카테고리 매거진이 아직 없어요. 곧 올라올 거예요!`
                : '아직 매거진이 없어요. 곧 유익한 글이 올라올 거예요!'}
          </p>
          {(q || category) && (
            <Link
              href="/magazine"
              className="inline-flex items-center justify-center h-[52px] px-6 rounded-xl bg-primary text-white text-body font-bold no-underline hover:bg-primary/90"
            >
              {q ? '검색 초기화' : '전체 매거진 보기'}
            </Link>
          )}
        </div>
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
      className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border overflow-hidden no-underline transition-colors hover:border-primary/30 min-h-[52px]"
    >
      {post.thumbnailUrl ? (
        <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            className="object-cover"
            sizes="96px"
            priority={priority}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl">
          📖
        </div>
      )}
      <div className="flex-1 min-w-0">
        {post.category && (
          <span className="text-caption text-primary-text font-bold mb-1 block">{post.category}</span>
        )}
        <p className="text-body font-bold text-foreground m-0 line-clamp-2 leading-snug">
          {post.title}
        </p>
        {post.preview && (
          <p className="text-body text-muted-foreground mt-1 m-0 line-clamp-2">{post.preview}</p>
        )}
        <p className="text-caption text-muted-foreground mt-1 m-0">
          👁 {post.viewCount} · {formatTimeAgo(post.createdAt)}
        </p>
      </div>
    </Link>
  )
}
