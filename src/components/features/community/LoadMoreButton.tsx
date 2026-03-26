'use client'

import { useState, useTransition } from 'react'
import type { PostSummary } from '@/types/api'
import PostCard from './PostCard'

interface LoadMoreButtonProps {
  boardSlug: string
  boardType: string
  category?: string
  initialHasMore: boolean
  initialLastId?: string
}

export default function LoadMoreButton({
  boardSlug,
  boardType,
  category,
  initialHasMore,
  initialLastId,
}: LoadMoreButtonProps) {
  const [morePosts, setMorePosts] = useState<PostSummary[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [cursor, setCursor] = useState(initialLastId)
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    if (isPending || !hasMore || !cursor) return

    startTransition(async () => {
      const params = new URLSearchParams({
        boardType,
        cursor,
        limit: '20',
      })
      if (category && category !== '전체') {
        params.set('category', category)
      }
      const res = await fetch(`/api/posts?${params.toString()}`)
      if (!res.ok) return

      const data = await res.json() as { posts: PostSummary[]; hasMore: boolean }
      setMorePosts((prev) => [...prev, ...data.posts])
      setHasMore(data.hasMore)
      if (data.posts.length > 0) {
        setCursor(data.posts[data.posts.length - 1].id)
      }
    })
  }

  return (
    <>
      {morePosts.length > 0 && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6 mt-4">
          {morePosts.map((post) => (
            <PostCard key={post.id} post={post} boardSlug={boardSlug} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center py-8">
          <button
            onClick={handleLoadMore}
            disabled={isPending}
            className="min-h-[52px] px-12 py-3.5 rounded-full border-2 border-border bg-card text-muted-foreground text-[0.88rem] font-bold cursor-pointer transition-all shadow-sm hover:border-primary hover:text-primary hover:bg-primary/5 hover:shadow-[0_3px_10px_rgba(255,111,97,0.15)] hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? '불러오는 중...' : '더보기'}
          </button>
        </div>
      )}
    </>
  )
}
