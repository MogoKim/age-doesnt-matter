import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { BOARD_CONFIGS, getMockPostDetail, getMockComments } from '@/components/features/community/mock-data'
import ActionBar from '@/components/features/community/ActionBar'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import styles from '@/components/features/community/Community.module.css'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { postId } = await params
  const post = getMockPostDetail(postId)
  if (!post) return {}

  return {
    title: post.title,
    description: post.preview,
  }
}

export default async function PostDetailPage({ params }: PageProps) {
  const { boardSlug, postId } = await params

  const board = BOARD_CONFIGS[boardSlug]
  if (!board) notFound()

  const post = getMockPostDetail(postId)
  if (!post) notFound()

  const comments = getMockComments(postId)

  return (
    <div className={styles.detailContainer}>
      {/* 뒤로가기 */}
      <Link href={`/community/${boardSlug}`} className={styles.backLink}>
        ← {board.displayName}
      </Link>

      {/* 게시글 헤더 */}
      <div className={styles.detailHeader}>
        {post.category && (
          <span className={styles.detailCategory}>{post.category}</span>
        )}
        <h1 className={styles.detailTitle}>{post.title}</h1>
        <div className={styles.detailMeta}>
          <span>{post.author.gradeEmoji}</span>
          <span className={styles.detailAuthorBadge}>{post.author.nickname}</span>
          <span>·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          <span>·</span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>

      {/* 본문 */}
      <div
        className={styles.detailContent}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      {/* 액션 바 */}
      <ActionBar
        likeCount={post.likeCount}
        isLiked={post.isLiked}
        isScrapped={post.isScrapped}
      />

      {/* 광고 슬롯 */}
      <div className={styles.listAdInline} style={{ marginBottom: 'var(--space-xl)' }}>
        <span className={styles.listAdLabel}>광고</span>
        광고 영역
      </div>

      {/* 댓글 */}
      <CommentSection comments={comments} />
    </div>
  )
}
