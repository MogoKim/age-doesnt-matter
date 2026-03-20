'use client'

import { useState, useTransition } from 'react'
import type { CommentItem as CommentItemType } from '@/types/api'
import { formatTimeAgo } from './utils'
import { cn } from '@/lib/utils'
import { toggleCommentLike } from '@/lib/actions/likes'
import CommentInput from './CommentInput'

interface CommentItemProps {
  comment: CommentItemType
  postId: string
  isReply?: boolean
}

export default function CommentItem({ comment, postId, isReply = false }: CommentItemProps) {
  const [isLiked, setIsLiked] = useState(comment.isLiked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleLike() {
    if (isPending) return
    setIsLiked(!isLiked)
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1)

    startTransition(async () => {
      const result = await toggleCommentLike(comment.id)
      if (result.error) {
        setIsLiked(isLiked)
        setLikeCount(likeCount)
        alert(result.error)
      }
    })
  }

  if (comment.isDeleted) {
    return (
      <div className="py-4 border-b border-[#f0eeec] text-muted-foreground text-xs italic">
        삭제된 댓글입니다.
        {comment.replies.length > 0 && (
          <div>
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} postId={postId} isReply />
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
        <button
          className={cn(
            'flex items-center gap-1 bg-none border-none text-muted-foreground text-[13px] cursor-pointer min-h-[52px] px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5',
            isLiked && 'text-primary font-bold'
          )}
          onClick={handleLike}
          disabled={isPending}
          aria-label="공감"
        >
          ❤️ {likeCount > 0 && likeCount}
        </button>
        {!isReply && (
          <button
            className="flex items-center gap-1 bg-none border-none text-muted-foreground text-[13px] cursor-pointer min-h-[52px] px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
            onClick={() => setShowReplyInput(!showReplyInput)}
            aria-label="답글"
          >
            답글
          </button>
        )}
      </div>

      {showReplyInput && (
        <div className="mt-2">
          <CommentInput
            postId={postId}
            parentId={comment.id}
            placeholder="답글을 남겨주세요..."
            onCancel={() => setShowReplyInput(false)}
          />
        </div>
      )}

      {!isReply && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} postId={postId} isReply />
          ))}
        </div>
      )}
    </div>
  )
}
