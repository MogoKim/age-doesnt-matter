'use client'

import { useState, useTransition, useCallback, memo } from 'react'
import type { CommentItem as CommentItemType } from '@/types/api'
import { formatTimeAgo } from './utils'
import { cn } from '@/lib/utils'
import { toggleCommentLike } from '@/lib/actions/likes'
import { toggleGuestCommentLike } from '@/lib/actions/guest-likes'
import { IconHeart } from '@/components/icons'
import { editComment, deleteComment } from '@/lib/actions/comments'
import { useToast } from '@/components/common/Toast'
import CommentInput from './CommentInput'
import GuestCommentInput from './GuestCommentInput'
import GuestPasswordModal from './GuestPasswordModal'

interface CommentItemProps {
  comment: CommentItemType
  postId: string
  isReply?: boolean
  isLoggedIn?: boolean
}

function CommentItem({ comment, postId, isReply = false, isLoggedIn = false }: CommentItemProps) {
  const { toast } = useToast()
  const [isLiked, setIsLiked] = useState(comment.isLiked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(comment.content)
  const [isPending, startTransition] = useTransition()
  const [guestModal, setGuestModal] = useState<'edit' | 'delete' | null>(null)

  const handleLike = useCallback(() => {
    if (isPending) return

    if (!isLoggedIn) {
      if (isLiked) {
        toast('이미 공감하셨어요')
        return
      }
      const prevCount = likeCount
      setIsLiked(true)
      setLikeCount(prevCount + 1)
      startTransition(async () => {
        const result = await toggleGuestCommentLike(comment.id)
        if (result.alreadyLiked) {
          setLikeCount(prevCount)
          toast('이미 공감하셨어요')
        } else if (result.error) {
          setIsLiked(false)
          setLikeCount(prevCount)
        }
      })
      return
    }

    const prevLiked = isLiked
    const prevCount = likeCount
    setIsLiked(!prevLiked)
    setLikeCount(prevLiked ? prevCount - 1 : prevCount + 1)

    startTransition(async () => {
      const result = await toggleCommentLike(comment.id)
      if (result.error) {
        setIsLiked(prevLiked)
        setLikeCount(prevCount)
        toast(result.error, 'error')
      }
    })
  }, [isPending, isLoggedIn, isLiked, likeCount, comment.id, toast])

  const handleEdit = useCallback(() => {
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
  }, [isPending, comment.id, editValue, toast])

  const handleDelete = useCallback(() => {
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
  }, [isPending, comment.id, toast])

  if (comment.isDeleted) {
    return (
      <div className="py-4 border-b border-[#f0eeec] text-muted-foreground text-caption italic">
        삭제된 댓글입니다.
        {comment.replies.length > 0 && (
          <div>
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} postId={postId} isReply isLoggedIn={isLoggedIn} />
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
        {comment.isGuest ? (
          <>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption bg-muted text-muted-foreground font-medium leading-none">비회원</span>
            <span className="text-sm font-bold text-foreground">{comment.guestNickname}</span>
          </>
        ) : comment.author ? (
          <>
            <span className="text-sm">{comment.author.gradeEmoji}</span>
            <span className="text-sm font-bold text-foreground">{comment.author.nickname}</span>
          </>
        ) : null}
        <span className="text-caption text-muted-foreground">· {formatTimeAgo(comment.createdAt)}</span>

        {/* 회원 본인 댓글 수정/삭제 */}
        {comment.isOwn && !comment.isGuest && (
          <div className="ml-auto flex items-center gap-1">
            {comment.canEdit && (
              <button
                className="text-caption text-muted-foreground px-3 py-2 min-h-[52px] hover:text-primary transition-colors"
                onClick={() => { setIsEditing(!isEditing); setEditValue(comment.content) }}
              >
                수정
              </button>
            )}
            <button
              className="text-caption text-muted-foreground px-3 py-2 min-h-[52px] hover:text-destructive transition-colors"
              onClick={handleDelete}
              disabled={isPending}
            >
              삭제
            </button>
          </div>
        )}

        {/* 비회원 댓글 수정/삭제 (비밀번호 확인) */}
        {comment.isGuest && (
          <div className="ml-auto flex items-center gap-1">
            <button
              className="text-caption text-muted-foreground px-3 py-2 min-h-[52px] hover:text-primary transition-colors"
              onClick={() => setGuestModal('edit')}
            >
              수정
            </button>
            <button
              className="text-caption text-muted-foreground px-3 py-2 min-h-[52px] hover:text-destructive transition-colors"
              onClick={() => setGuestModal('delete')}
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="mb-2">
          <textarea
            className="w-full min-h-[80px] px-4 py-2.5 border border-border rounded-xl text-body text-foreground bg-background resize-none outline-none transition-colors focus:border-primary"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 text-caption font-bold text-muted-foreground min-h-[52px] rounded-lg hover:text-foreground transition-colors"
              onClick={() => setIsEditing(false)}
            >
              취소
            </button>
            <button
              className="px-4 py-2 text-caption font-bold text-white bg-primary rounded-lg min-h-[52px] hover:bg-[#E85D50] disabled:bg-border disabled:cursor-not-allowed transition-colors"
              onClick={handleEdit}
              disabled={isPending || !editValue.trim()}
            >
              {isPending ? '수정 중...' : '수정'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-body text-foreground m-0 mb-2 break-keep leading-[1.7]">{comment.content}</p>
      )}

      <div className="flex items-center gap-4">
        <button
          className={cn(
            'flex items-center gap-1 bg-none border-none text-muted-foreground text-caption cursor-pointer min-h-[52px] px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5',
            isLiked && 'text-primary font-bold'
          )}
          onClick={handleLike}
          disabled={isPending}
          aria-label="공감"
        >
          <IconHeart size={16} filled={isLiked} /> {likeCount > 0 && likeCount}
        </button>
        {!isReply && (
          <button
            className="flex items-center gap-1 bg-none border-none text-muted-foreground text-caption cursor-pointer min-h-[52px] px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
            onClick={() => setShowReplyInput(!showReplyInput)}
            aria-label="답글"
          >
            답글
          </button>
        )}
      </div>

      {showReplyInput && (
        <div className="mt-2">
          {isLoggedIn ? (
            <CommentInput
              postId={postId}
              parentId={comment.id}
              placeholder="답글을 남겨주세요..."
              onCancel={() => setShowReplyInput(false)}
            />
          ) : (
            <GuestCommentInput
              postId={postId}
              parentId={comment.id}
              placeholder="답글을 남겨주세요... (최대 500자)"
              onCancel={() => setShowReplyInput(false)}
              onSuccess={() => setShowReplyInput(false)}
            />
          )}
        </div>
      )}

      {!isReply && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} postId={postId} isReply isLoggedIn={isLoggedIn} />
          ))}
        </div>
      )}

      {guestModal && (
        <GuestPasswordModal
          commentId={comment.id}
          mode={guestModal}
          initialContent={comment.content}
          onClose={() => setGuestModal(null)}
        />
      )}
    </div>
  )
}

export default memo(CommentItem, (prev, next) =>
  prev.comment.id === next.comment.id &&
  prev.comment.content === next.comment.content &&
  prev.comment.likeCount === next.comment.likeCount &&
  prev.comment.isLiked === next.comment.isLiked &&
  prev.comment.replies.length === next.comment.replies.length &&
  prev.postId === next.postId &&
  prev.isReply === next.isReply &&
  prev.isLoggedIn === next.isLoggedIn
)
