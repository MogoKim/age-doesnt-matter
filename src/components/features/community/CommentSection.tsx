'use client'

import { useState, useMemo, useOptimistic, useCallback } from 'react'
import type { CommentItem as CommentItemType } from '@/types/api'
import type { Grade } from '@/generated/prisma/client'
import { GRADE_INFO } from '@/lib/grade'
import CommentItemComponent from './CommentItem'
import CommentInput from './CommentInput'
import GuestCommentInput from './GuestCommentInput'

interface CommentSectionProps {
  postId: string
  comments: CommentItemType[]
  isLoggedIn?: boolean
  currentUser?: { id: string; nickname: string; grade: Grade; profileImage: string | null }
}

function sortComments(comments: CommentItemType[], sort: 'latest' | 'likes'): CommentItemType[] {
  const sorted = [...comments]
  if (sort === 'likes') {
    sorted.sort((a, b) => b.likeCount - a.likeCount)
  }
  return sorted
}

export default function CommentSection({ postId, comments, isLoggedIn, currentUser }: CommentSectionProps) {
  const [sort, setSort] = useState<'latest' | 'likes'>('latest')
  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (state: CommentItemType[], newComment: CommentItemType) => [newComment, ...state],
  )

  const handleOptimisticAdd = useCallback((content: string) => {
    if (!currentUser) return
    const gradeEmoji = GRADE_INFO[currentUser.grade as keyof typeof GRADE_INFO]?.emoji ?? '🌱'
    addOptimisticComment({
      id: `temp-${Date.now()}`,
      content,
      author: { id: currentUser.id, nickname: currentUser.nickname, grade: currentUser.grade, gradeEmoji, profileImage: currentUser.profileImage },
      likeCount: 0, isLiked: false, isDeleted: false, isOwn: true, canEdit: true,
      createdAt: new Date().toISOString(),
      replies: [],
    })
  }, [currentUser, addOptimisticComment])

  const totalCount = optimisticComments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  )

  const bestComments = useMemo(() =>
    comments
      .filter(c => c.likeCount >= 1)
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 3),
  [comments])

  const sorted = useMemo(() => sortComments(optimisticComments, sort), [optimisticComments, sort])

  return (
    <section className="mb-12">
      {bestComments.length > 0 && (
        <div className="mb-6 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <p className="text-caption font-bold text-primary mb-2">인기 댓글</p>
          {bestComments.map((comment) => (
            <CommentItemComponent
              key={`best-${comment.id}`}
              comment={comment}
              postId={postId}
              isLoggedIn={isLoggedIn}
              isBest
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-foreground">
        <h3 className="text-lg font-medium text-foreground m-0">
          💬 댓글 <span className="text-primary font-bold">{totalCount}</span>
        </h3>
        <div className="flex gap-1">
          <button
            className={`px-4 py-2 rounded-full text-caption font-bold cursor-pointer min-h-[52px] transition-all ${
              sort === 'latest'
                ? 'bg-primary/5 border border-primary text-primary'
                : 'bg-none border border-transparent text-muted-foreground hover:bg-background'
            }`}
            onClick={() => setSort('latest')}
          >
            등록순
          </button>
          <button
            className={`px-4 py-2 rounded-full text-caption font-bold cursor-pointer min-h-[52px] transition-all ${
              sort === 'likes'
                ? 'bg-primary/5 border border-primary text-primary'
                : 'bg-none border border-transparent text-muted-foreground hover:bg-background'
            }`}
            onClick={() => setSort('likes')}
          >
            공감순
          </button>
        </div>
      </div>

      {sorted.length > 0 ? (
        <div>
          {sorted.map((comment) => (
            <CommentItemComponent key={comment.id} comment={comment} postId={postId} isLoggedIn={isLoggedIn} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <p className="text-body text-muted-foreground leading-[1.8]">
            아직 댓글이 없어요.<br />
            따뜻한 한마디를 남겨보세요!
          </p>
        </div>
      )}

      {isLoggedIn ? (
        <CommentInput postId={postId} onOptimisticAdd={currentUser ? handleOptimisticAdd : undefined} />
      ) : (
        <GuestCommentInput postId={postId} />
      )}
    </section>
  )
}
