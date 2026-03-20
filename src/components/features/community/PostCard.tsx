import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from './utils'
import styles from './Community.module.css'

interface PostCardProps {
  post: PostSummary
  boardSlug: string
}

export default function PostCard({ post, boardSlug }: PostCardProps) {
  return (
    <Link
      href={`/community/${boardSlug}/${post.id}`}
      className={styles.postCard}
    >
      {post.category && (
        <span className={styles.postCardCategory}>{post.category}</span>
      )}

      <h3 className={styles.postCardTitle}>
        {post.promotionLevel === 'HOT' && (
          <span className={styles.promotionBadgeHot}>HOT </span>
        )}
        {post.promotionLevel === 'FAME' && (
          <span className={styles.promotionBadgeFame}>FAME </span>
        )}
        {post.title}
      </h3>

      <p className={styles.postCardPreview}>{post.preview}</p>

      <div className={styles.postCardMeta}>
        <span>{post.author.gradeEmoji}</span>
        <span className={styles.postCardAuthor}>{post.author.nickname}</span>
        <span className={styles.postCardDot}>·</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>

      <div className={styles.postCardStats}>
        <span className={styles.postCardStat}>
          ❤️ {post.likeCount}
        </span>
        <span className={styles.postCardStat}>
          💬 {post.commentCount}
        </span>
        <span className={styles.postCardStat}>
          👁 {post.viewCount}
        </span>
      </div>
    </Link>
  )
}
