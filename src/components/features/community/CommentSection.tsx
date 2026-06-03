'use client'

import { useEffect, useState, useMemo, useOptimistic, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import type { CommentItem as CommentItemType } from '@/types/api'
import type { Grade } from '@/generated/prisma/client'

const GRADE_EMOJI: Record<string, string> = {
  SPROUT: '🌱', REGULAR: '🌿', WARM_NEIGHBOR: '☀️', HONORARY: '🏅',
}
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
  const { data: session, status } = useSession()
  const authKnown = typeof isLoggedIn === 'boolean' || status !== 'loading'
  const resolvedIsLoggedIn = isLoggedIn ?? status === 'authenticated'
  const resolvedCurrentUser = currentUser ?? (status === 'authenticated' ? session.user : undefined)
  const [personalizedComments, setPersonalizedComments] = useState(comments)
  const [sort, setSort] = useState<'latest' | 'likes'>('latest')

  useEffect(() => {
    setPersonalizedComments(comments)
  }, [comments])

  useEffect(() => {
    if (!resolvedIsLoggedIn) return
    let cancelled = false

    async function loadPersonalizedComments() {
      try {
        const res = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json() as { comments: CommentItemType[] }
        if (!cancelled) setPersonalizedComments(data.comments)
      } catch {
        // 공개 댓글을 그대로 유지한다.
      }
    }

    void loadPersonalizedComments()
    return () => { cancelled = true }
  }, [postId, resolvedIsLoggedIn])

  const [optimisticComments, addOptimisticComment] = useOptimistic(
    personalizedComments,
    (state: CommentItemType[], newComment: CommentItemType) => [newComment, ...state],
  )

  const handleOptimisticAdd = useCallback((content: string) => {
    if (!resolvedCurrentUser) return
    const gradeEmoji = GRADE_EMOJI[resolvedCurrentUser.grade] ?? '🌱'
    addOptimisticComment({
      id: `temp-${Date.now()}`,
      content,
      author: {
        id: resolvedCurrentUser.id,
        nickname: resolvedCurrentUser.nickname,
        grade: resolvedCurrentUser.grade,
        gradeEmoji,
        profileImage: resolvedCurrentUser.profileImage,
      },
      likeCount: 0, isLiked: false, isDeleted: false, isOwn: true, canEdit: true,
      createdAt: new Date().toISOString(),
      replies: [],
    })
  }, [resolvedCurrentUser, addOptimisticComment])

  const totalCount = optimisticComments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  )

  const bestComments = useMemo(() =>
    personalizedComments
      .filter(c => c.likeCount >= 1)
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 3),
  [personalizedComments])

  const sorted = useMemo(() => sortComments(optimisticComments, sort), [optimisticComments, sort])

  return (
    <section className="mb-12">
      {bestComments.length > 0 && (
        <div className="mb-6 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <p className="text-caption font-bold text-primary-text mb-2">인기 댓글</p>
          {bestComments.map((comment) => (
            <CommentItemComponent
              key={`best-${comment.id}`}
              comment={comment}
              postId={postId}
              isLoggedIn={resolvedIsLoggedIn}
              isBest
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-foreground">
        <h3 className="text-lg font-bold text-foreground m-0">
          💬 댓글 <span className="text-primary-text font-bold">{totalCount}</span>
        </h3>
        <div className="flex gap-1">
          <button
            className={`px-4 py-2 rounded-full text-[17px] font-bold cursor-pointer min-h-[52px] transition-colors ${
              sort === 'latest'
                ? 'bg-primary/5 border border-primary text-primary-text'
                : 'bg-none border border-transparent text-foreground hover:bg-background'
            }`}
            onClick={() => setSort('latest')}
          >
            등록순
          </button>
          <button
            className={`px-4 py-2 rounded-full text-[17px] font-bold cursor-pointer min-h-[52px] transition-colors ${
              sort === 'likes'
                ? 'bg-primary/5 border border-primary text-primary-text'
                : 'bg-none border border-transparent text-foreground hover:bg-background'
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
            <CommentItemComponent key={comment.id} comment={comment} postId={postId} isLoggedIn={resolvedIsLoggedIn} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <div className="text-[48px]">💬</div>
          <p className="text-body text-muted-foreground leading-[1.8]">
            아직 댓글이 없어요.<br />
            따뜻한 한마디를 남겨보세요!
          </p>
        </div>
      )}

      {!authKnown ? (
        <div className="h-24 bg-muted rounded-2xl animate-pulse" aria-hidden="true" />
      ) : resolvedIsLoggedIn ? (
        <CommentInput postId={postId} onOptimisticAdd={resolvedCurrentUser ? handleOptimisticAdd : undefined} />
      ) : (
        <GuestCommentInput postId={postId} />
      )}
    </section>
  )
}
