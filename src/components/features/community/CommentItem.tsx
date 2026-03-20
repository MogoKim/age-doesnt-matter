import type { CommentItem as CommentItemType } from '@/types/api'
import { formatTimeAgo } from './utils'
import styles from './Community.module.css'

interface CommentItemProps {
  comment: CommentItemType
  isReply?: boolean
}

export default function CommentItem({ comment, isReply = false }: CommentItemProps) {
  if (comment.isDeleted) {
    return (
      <div className={styles.commentItemDeleted}>
        삭제된 댓글입니다.
        {comment.replies.length > 0 && (
          <div>
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={isReply ? styles.commentItemReply : styles.commentItem}>
      <div className={styles.commentAuthor}>
        {comment.author && (
          <>
            <span className={styles.commentGrade}>{comment.author.gradeEmoji}</span>
            <span className={styles.commentNickname}>{comment.author.nickname}</span>
          </>
        )}
        <span className={styles.commentTime}>· {formatTimeAgo(comment.createdAt)}</span>
      </div>

      <p className={styles.commentBody}>{comment.content}</p>

      <div className={styles.commentActions}>
        <button className={styles.commentActionBtn} aria-label="공감">
          ❤️ {comment.likeCount > 0 && comment.likeCount}
        </button>
        {!isReply && (
          <button className={styles.commentActionBtn} aria-label="답글">
            답글
          </button>
        )}
      </div>

      {/* 대댓글 (1단계만) */}
      {!isReply && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} isReply />
          ))}
        </div>
      )}
    </div>
  )
}
