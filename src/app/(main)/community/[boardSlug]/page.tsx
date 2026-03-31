import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { getBoardConfig } from '@/lib/queries/boards'
import { getPostsByBoard } from '@/lib/queries/posts'
import BoardFilter from '@/components/features/community/BoardFilter'
import PostCard from '@/components/features/community/PostCard'
import LoadMoreButton from '@/components/features/community/LoadMoreButton'
import SortToggle from '@/components/features/community/SortToggle'
import FeedAd from '@/components/ad/FeedAd'
import CoupangBanner from '@/components/ad/CoupangBanner'
import ResponsiveAd from '@/components/ad/ResponsiveAd'

interface PageProps {
  params: Promise<{ boardSlug: string }>
  searchParams: Promise<{ category?: string; sort?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug } = await params
  try {
    const board = await getBoardConfig(boardSlug)
    if (!board) return { title: '게시판' }
    return {
      title: board.displayName,
      description: board.description,
    }
  } catch {
    return { title: '게시판' }
  }
}

export default async function BoardListPage({ params, searchParams }: PageProps) {
  const { boardSlug } = await params
  const { category, sort } = await searchParams

  const board = await getBoardConfig(boardSlug)
  if (!board) notFound()

  const sortOption = sort === 'likes' ? 'likes' as const : 'latest' as const
  const { posts, hasMore } = await getPostsByBoard(board.boardType, { category, sort: sortOption, limit: 20 })
  const lastId = posts.length > 0 ? posts[posts.length - 1].id : undefined

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-12">
      {/* 게시판 헤더 */}
      <div className="mb-6 p-6 bg-card rounded-2xl border-l-4 border-l-primary shadow-sm">
        <h1 className="text-xl font-bold text-foreground m-0 mb-1">{board.displayName}</h1>
        <p className="text-sm text-muted-foreground m-0">{board.description}</p>
      </div>

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

      {/* 게시글 목록 */}
      {posts.length > 0 ? (
        <>
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
            {posts.map((post, idx) => (
              <div key={post.id}>
                <PostCard post={post} boardSlug={boardSlug} />
                {(idx + 1) % 3 === 0 && (idx + 1) % 6 !== 0 && (
                  <div className="mt-4"><FeedAd /></div>
                )}
                {(idx + 1) % 6 === 0 && (
                  <div className="mt-4"><ResponsiveAd mobile={<CoupangBanner preset="mobile" className="rounded-2xl overflow-hidden" />} desktop={null} /></div>
                )}
              </div>
            ))}
          </div>

          <LoadMoreButton
            boardSlug={boardSlug}
            boardType={board.boardType}
            category={category}
            initialHasMore={hasMore}
            initialLastId={lastId}
          />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <div className="text-[56px] mb-4">📝</div>
          <p className="text-sm text-muted-foreground leading-[1.8]">
            아직 작성된 글이 없어요.<br />첫 번째 글을 남겨보세요!
          </p>
        </div>
      )}
    </div>
  )
}
