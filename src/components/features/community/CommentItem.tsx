import type { CommentItem as CommentItemType } from '@/types/api'
import { formatTimeAgo } from './utils'
import { cn } from '@/lib/utils'

interface CommentItemProps {
  comment: CommentItemType
  isReply?: boolean
}

export default function CommentItem({ comment, isReply = false }: CommentItemProps) {
  if (comment.isDeleted) {
    return (
      <div className="py-4 border-b border-[#f0eeec] text-muted-foreground text-xs italic">
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
    <div
      className={cn(
        'py-4 border-b border-[#f0eeec]',
        isReply && 'pl-8 bg-background rounded-lg p-4 pl-8 mt-1 border-b-0 relative before:content-[""] before:absolute before:left-4 before:top-4 before:bottom-4 before:w-0.5 before:bg-primary/20 before:rounded-sm'
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {comment.author && (
          <>
            <span className="text-sm">{comment.author.gradeEmoji}</span>
            <span className="text-sm font-bold text-foreground">{comment.author.nickname}</span>
          </>
        )}
        <span className="text-xs text-muted-foreground">· {formatTimeAgo(comment.createdAt)}</span>
      </div>

      <p className="text-sm text-foreground m-0 mb-2 break-keep leading-[1.7]">{comment.content}</p>

      <div className="flex items-center gap-4">
        <button className="flex items-center gap-1 bg-none border-none text-muted-foreground text-[13px] cursor-pointer min-h-9 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5" aria-label="공감">
          ❤️ {comment.likeCount > 0 && comment.likeCount}
        </button>
        {!isReply && (
          <button className="flex items-center gap-1 bg-none border-none text-muted-foreground text-[13px] cursor-pointer min-h-9 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5" aria-label="답글">
            답글
          </button>
        )}
      </div>

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
