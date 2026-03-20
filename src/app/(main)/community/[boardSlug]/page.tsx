import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BOARD_CONFIGS, getMockPosts } from '@/components/features/community/mock-data'
import BoardFilter from '@/components/features/community/BoardFilter'
import PostCard from '@/components/features/community/PostCard'

interface PageProps {
  params: Promise<{ boardSlug: string }>
  searchParams: Promise<{ category?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug } = await params
  const board = BOARD_CONFIGS[boardSlug]
  if (!board) return {}

  return {
    title: board.displayName,
    description: board.description,
  }
}

export function generateStaticParams() {
  return Object.keys(BOARD_CONFIGS).map((slug) => ({ boardSlug: slug }))
}

export default async function BoardListPage({ params, searchParams }: PageProps) {
  const { boardSlug } = await params
  const { category } = await searchParams

  const board = BOARD_CONFIGS[boardSlug]
  if (!board) notFound()

  const allPosts = getMockPosts(boardSlug)

  const posts = category
    ? allPosts.filter((p) => p.category === category)
    : allPosts

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-12">
      {/* 게시판 헤더 */}
      <div className="mb-6 p-6 bg-card rounded-2xl border-l-4 border-l-primary shadow-sm">
        <h1 className="text-xl font-bold text-foreground m-0 mb-1">{board.displayName}</h1>
        <p className="text-sm text-muted-foreground m-0">{board.description}</p>
      </div>

      {/* 카테고리 필터 */}
      {board.categories.length > 1 && (
        <Suspense fallback={null}>
          <BoardFilter categories={board.categories} boardSlug={boardSlug} />
        </Suspense>
      )}

      {/* 게시글 목록 */}
      {posts.length > 0 ? (
        <>
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
            {posts.map((post, idx) => (
              <>
                <PostCard key={post.id} post={post} boardSlug={boardSlug} />
                {idx === 4 && (
                  <div key="ad-inline" className="bg-[#F9F5F0] rounded-2xl px-4 py-8 text-center relative border border-dashed border-border text-muted-foreground text-xs">
                    <span className="absolute top-2 left-2 text-[11px] text-muted-foreground bg-white/90 px-2 py-0.5 rounded-full font-medium">광고</span>
                    광고 영역
                  </div>
                )}
              </>
            ))}
          </div>

          {/* 더보기 버튼 */}
          <div className="flex justify-center py-8">
            <button className="min-h-[52px] px-12 py-3.5 rounded-full border-2 border-border bg-card text-muted-foreground text-xs font-bold cursor-pointer transition-all shadow-sm hover:border-primary hover:text-primary hover:bg-primary/5 hover:shadow-[0_3px_10px_rgba(255,111,97,0.15)] hover:-translate-y-px">더보기</button>
          </div>
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
