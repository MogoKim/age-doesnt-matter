'use client'

import { useEffect, useState, useMemo, useOptimistic, useCallback } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
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
  /** 가입인사 글이면 비회원 댓글 문구를 환영 톤으로(Phase 4, 문구 특화 전용) */
  isGreeting?: boolean
}

function sortComments(comments: CommentItemType[], sort: 'oldest' | 'likes'): CommentItemType[] {
  const sorted = [...comments]
  if (sort === 'likes') {
    sorted.sort((a, b) => b.likeCount - a.likeCount)
  }
  return sorted
}

/** 오늘의 투표 진영 배지 — /api/votes/badges 응답 */
interface VoteBadges {
  optionA: string
  optionB: string
  byUserId: Record<string, 'A' | 'B'>
}

export default function CommentSection({ postId, comments, isLoggedIn, currentUser, isGreeting }: CommentSectionProps) {
  const { user, status } = useAppSession()
  const authKnown = typeof isLoggedIn === 'boolean' || status !== 'loading'
  const resolvedIsLoggedIn = isLoggedIn ?? status === 'authenticated'
  const resolvedCurrentUser = currentUser ?? (status === 'authenticated' ? user ?? undefined : undefined)
  const [personalizedComments, setPersonalizedComments] = useState(comments)
  const [sort, setSort] = useState<'oldest' | 'likes'>('oldest')
  const [voteBadges, setVoteBadges] = useState<VoteBadges | null>(null)

  // 진영 배지 — 이 글에 연동된 투표가 있을 때만 값이 옴 (1회 fetch)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/votes/badges?postId=${encodeURIComponent(postId)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { badges: VoteBadges | null }
        if (!cancelled && data.badges) setVoteBadges(data.badges)
      } catch {
        // 배지는 부가 기능 — 실패해도 댓글 렌더 유지
      }
    })()
    return () => { cancelled = true }
  }, [postId])


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
    (state: CommentItemType[], newComment: CommentItemType) => [...state, newComment],
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

  const handleGuestOptimisticAdd = useCallback((data: { content: string; guestNickname: string }) => {
    addOptimisticComment({
      id: `temp-guest-${Date.now()}`,
      content: data.content,
      author: null,
      guestNickname: data.guestNickname,
      isGuest: true,
      likeCount: 0, isLiked: false, isDeleted: false, isOwn: false, canEdit: false,
      createdAt: new Date().toISOString(),
      replies: [],
    })
  }, [addOptimisticComment])

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
          <p className="text-caption font-bold text-[#B23B2E] mb-2">인기 댓글</p>
          {bestComments.map((comment) => (
            <CommentItemComponent
              key={`best-${comment.id}`}
              comment={comment}
              postId={postId}
              isLoggedIn={resolvedIsLoggedIn}
              isBest
              campBadges={voteBadges}
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
              sort === 'oldest'
                ? 'bg-primary/5 border border-primary text-primary-text'
                : 'bg-none border border-transparent text-foreground hover:bg-background'
            }`}
            onClick={() => setSort('oldest')}
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
            <CommentItemComponent key={comment.id} comment={comment} postId={postId} isLoggedIn={resolvedIsLoggedIn} campBadges={voteBadges} />
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

      {/* 투표 위젯 "한마디 남기기" CTA 스크롤 목적지 */}
      <div id="vote-comment-anchor" aria-hidden="true" />

      {!authKnown ? (
        <div className="h-24 bg-muted rounded-2xl animate-pulse" aria-hidden="true" />
      ) : resolvedIsLoggedIn ? (
        <CommentInput postId={postId} onOptimisticAdd={resolvedCurrentUser ? handleOptimisticAdd : undefined} />
      ) : (
        <GuestCommentInput postId={postId} onOptimisticAdd={handleGuestOptimisticAdd} isGreeting={isGreeting} />
      )}
    </section>
  )
}
