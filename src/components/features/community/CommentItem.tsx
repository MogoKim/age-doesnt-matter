'use client'

import { useState, useTransition } from 'react'
import type { CommentItem as CommentItemType } from '@/types/api'
import { formatTimeAgo } from './utils'
import { cn } from '@/lib/utils'
import { toggleCommentLike } from '@/lib/actions/likes'
import { editComment, deleteComment } from '@/lib/actions/comments'
import { useToast } from '@/components/common/Toast'
import CommentInput from './CommentInput'

interface CommentItemProps {
  comment: CommentItemType
  postId: string
  isReply?: boolean
}

export default function CommentItem({ comment, postId, isReply = false }: CommentItemProps) {
  const { toast } = useToast()
  const [isLiked, setIsLiked] = useState(comment.isLiked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(comment.content)
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
        toast(result.error, 'error')
      }
    })
  }

  function handleEdit() {
    if (isPending) return
    setIsEditing(false)

    startTransition(async () => {
      const result = await editComment(comment.id, editValue)
      if (result.error) {
        toast(result.error, 'error')
        setIsEditing(true)
      } else {
        toast('댓글이 수정되었어요')
      }
    })
  }

  function handleDelete() {
    if (isPending) return
    if (!confirm('댓글을 삭제하시겠어요?')) return

    startTransition(async () => {
      const result = await deleteComment(comment.id)
      if (result.error) {
        toast(result.error, 'error')
      } else {
        toast('댓글이 삭제되었어요')
      }
    })
  }

  if (comment.isDeleted) {
    return (
      <div className="py-4 border-b border-[#f0eeec] text-muted-foreground text-[15px] italic">
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
        <span className="text-[15px] text-muted-foreground">· {formatTimeAgo(comment.createdAt)}</span>
        {comment.isOwn && (
          <div className="ml-auto flex items-center gap-1">
            {comment.canEdit && (
              <button
                className="text-[15px] text-muted-foreground px-3 py-2 min-h-[52px] hover:text-primary transition-colors"
                onClick={() => { setIsEditing(!isEditing); setEditValue(comment.content) }}
              >
                수정
              </button>
            )}
            <button
              className="text-[15px] text-muted-foreground px-3 py-2 min-h-[52px] hover:text-destructive transition-colors"
              onClick={handleDelete}
              disabled={isPending}
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="mb-2">
          <textarea
            className="w-full min-h-[80px] px-4 py-2.5 border border-border rounded-xl text-sm text-foreground bg-background resize-none outline-none transition-colors focus:border-primary"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 text-[15px] font-bold text-muted-foreground min-h-[52px] rounded-lg hover:text-foreground transition-colors"
              onClick={() => setIsEditing(false)}
            >
              취소
            </button>
            <button
              className="px-4 py-2 text-[15px] font-bold text-white bg-primary rounded-lg min-h-[52px] hover:bg-[#E85D50] disabled:bg-border disabled:cursor-not-allowed transition-colors"
              onClick={handleEdit}
              disabled={isPending || !editValue.trim()}
            >
              {isPending ? '수정 중...' : '수정'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-base text-foreground m-0 mb-2 break-keep leading-[1.7]">{comment.content}</p>
      )}

      <div className="flex items-center gap-4">
        <button
          className={cn(
            'flex items-center gap-1 bg-none border-none text-muted-foreground text-[15px] cursor-pointer min-h-[52px] px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5',
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
            className="flex items-center gap-1 bg-none border-none text-muted-foreground text-[15px] cursor-pointer min-h-[52px] px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
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
