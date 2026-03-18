import Link from 'next/link'
import Image from 'next/image'
import styles from './Card.module.css'
import type { PostSummary } from '@/types/api'
import { GRADE_EMOJI } from '@/types/api'
import { formatRelativeTime } from '@/lib/format'

interface CardProps {
  post: PostSummary
  href: string
}

export default function Card({ post, href }: CardProps) {
  return (
    <Link href={href} className={styles.card}>
      {post.category && <span className={styles.tag}>{post.category}</span>}

      <h3 className={styles.title}>
        {post.title}
        {post.promotionLevel === 'HOT' && <span className={styles.hot}>🔥</span>}
        {post.promotionLevel === 'FAME' && <span className={styles.hot}>👑</span>}
      </h3>

      {post.preview && <p className={styles.preview}>{post.preview}</p>}

      {post.thumbnailUrl && (
        <Image
          src={post.thumbnailUrl}
          alt=""
          width={400}
          height={225}
          className={styles.thumbnail}
        />
      )}

      <div className={styles.meta}>
        <span>
          {GRADE_EMOJI[post.author.grade]}
          {post.author.nickname}
        </span>
        <span>·</span>
        <span>{formatRelativeTime(post.createdAt)}</span>
      </div>

      <div className={styles.stats}>
        <span className={styles.stat}>❤️ {post.likeCount}</span>
        <span className={styles.stat}>💬 {post.commentCount}</span>
        <span className={styles.stat}>👁 {post.viewCount}</span>
      </div>
    </Link>
  )
}
