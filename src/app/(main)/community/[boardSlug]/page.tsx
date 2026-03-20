import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BOARD_CONFIGS, getMockPosts } from '@/components/features/community/mock-data'
import BoardFilter from '@/components/features/community/BoardFilter'
import PostCard from '@/components/features/community/PostCard'
import styles from '@/components/features/community/Community.module.css'

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

  // 카테고리 필터링
  const posts = category
    ? allPosts.filter((p) => p.category === category)
    : allPosts

  return (
    <div className={styles.pageContainer}>
      {/* 게시판 헤더 */}
      <div className={styles.boardHeader}>
        <h1 className={styles.boardTitle}>{board.displayName}</h1>
        <p className={styles.boardDescription}>{board.description}</p>
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
          <div className={styles.postList}>
            {posts.map((post, idx) => (
              <>
                <PostCard key={post.id} post={post} boardSlug={boardSlug} />
                {/* 5번째 카드 뒤에 광고 슬롯 */}
                {idx === 4 && (
                  <div key="ad-inline" className={styles.listAdInline}>
                    <span className={styles.listAdLabel}>광고</span>
                    광고 영역
                  </div>
                )}
              </>
            ))}
          </div>

          {/* 더보기 버튼 */}
          <div className={styles.loadMoreWrap}>
            <button className={styles.loadMoreBtn}>더보기</button>
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>📝</div>
          <p className={styles.emptyStateText}>
            아직 작성된 글이 없어요.<br />첫 번째 글을 남겨보세요!
          </p>
        </div>
      )}
    </div>
  )
}
