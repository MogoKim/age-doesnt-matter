import type { CommentItem as CommentItemType } from '@/types/api'
import CommentItemComponent from './CommentItem'
import CommentInput from './CommentInput'
import styles from './Community.module.css'

interface CommentSectionProps {
  comments: CommentItemType[]
}

export default function CommentSection({ comments }: CommentSectionProps) {
  const totalCount = comments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  )

  return (
    <section className={styles.commentSection}>
      <div className={styles.commentHeader}>
        <h3 className={styles.commentTitle}>
          💬 댓글 <span className={styles.commentCount}>{totalCount}</span>
        </h3>
        <div className={styles.commentSort}>
          <button className={styles.commentSortBtnActive}>등록순</button>
          <button className={styles.commentSortBtn}>공감순</button>
        </div>
      </div>

      {comments.length > 0 ? (
        <div>
          {comments.map((comment) => (
            <CommentItemComponent key={comment.id} comment={comment} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateText}>
            아직 댓글이 없어요. 첫 댓글을 남겨보세요!
          </p>
        </div>
      )}

      <CommentInput />
    </section>
  )
}
