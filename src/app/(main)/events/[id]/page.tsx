import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { voteVisibleStatus } from '@/lib/vote-status'
import { getCommentsByPostId } from '@/lib/queries/comments'
import CommentSection from '@/components/features/community/CommentSection'
import EventDetail from '@/components/features/event/EventDetail'
import FeedbackDetail from '@/components/features/event/FeedbackDetail'
import SurveyDetail from '@/components/features/event/SurveyDetail'
import { getSurveyResponseStatus } from '@/lib/actions/survey'
import { DEFAULT_CONSENT_TEXT, type SurveyQuestion } from '@/lib/events/survey'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ src?: string }>
}

// 참여 이벤트는 기간성·참여형 히든 목적지 — 검색 색인 제외(사는이야기 글로 색인 방지)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// 09:00 오픈/20:00 마감을 읽기 시점 계산으로 반영 — 캐시 금지(투표 상태·내 선택 실시간)
export const dynamic = 'force-dynamic'

async function EventCommentsLoader({ postId }: { postId: string }) {
  const comments = await getCommentsByPostId(postId)
  return <CommentSection postId={postId} comments={comments} />
}

/** 의견수렴형(FEEDBACK) 의견 목록 — CommentSection을 '의견' 문구로, 마감 시 입력창 숨김 */
async function FeedbackCommentsLoader({ postId, readOnly }: { postId: string; readOnly: boolean }) {
  const comments = await getCommentsByPostId(postId)
  return <CommentSection postId={postId} comments={comments} variant="feedback" readOnly={readOnly} />
}

const CommentsFallback = (
  <div className="max-w-[720px] mx-auto px-4 space-y-4">
    <div className="h-8 bg-muted rounded animate-pulse w-32" />
    <div className="h-20 bg-muted rounded-xl animate-pulse" />
  </div>
)

export default async function EventDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const src = (await searchParams)?.src

  // Phase 5 — 1분 의견함(SURVEY) 우선 분기. VOTE는 id=voteEventId, FEEDBACK은 아래, 회귀 0.
  const sv = await prisma.event
    .findFirst({ where: { type: 'SURVEY', id }, select: { id: true, title: true, description: true, startAt: true, endAt: true, isActive: true } })
    .catch(() => null)
  if (sv) {
    const now = Date.now()
    if (!sv.isActive || now < sv.startAt.getTime()) notFound() // startAt 전(예약)·비활성 숨김
    const form = await prisma.surveyForm.findUnique({ where: { eventId: sv.id }, select: { questions: true, consentText: true } }).catch(() => null)
    if (!form) notFound()
    const closed = now >= sv.endAt.getTime()
    const { alreadyResponded } = await getSurveyResponseStatus(sv.id)
    return (
      <SurveyDetail
        data={{
          eventId: sv.id,
          title: sv.title,
          description: sv.description,
          questions: form.questions as unknown as SurveyQuestion[],
          consentText: form.consentText ?? DEFAULT_CONSENT_TEXT,
        }}
        closed={closed}
        alreadyResponded={alreadyResponded}
        source={src}
      />
    )
  }

  // Phase 3a — 의견수렴형(FEEDBACK) 우선 분기. VOTE는 id=voteEventId라 아래 기존 경로로 통과(회귀 0).
  //  /events/[eventId] 또는 (커뮤니티 리다이렉트 대비) /events/[bodyPostId] 둘 다 해석.
  const fb = await prisma.event
    .findFirst({
      where: { type: 'FEEDBACK', OR: [{ id }, { bodyPostId: id }] },
      select: { id: true, title: true, description: true, bodyPostId: true, startAt: true, endAt: true, isActive: true },
    })
    .catch(() => null)
  if (fb) {
    const now = Date.now()
    // startAt 전(예약)·비활성·본문 없음/비공개면 공개 화면에서 숨김
    if (!fb.isActive || now < fb.startAt.getTime() || !fb.bodyPostId) notFound()
    const bodyPost = await prisma.post
      .findUnique({ where: { id: fb.bodyPostId }, select: { content: true, status: true } })
      .catch(() => null)
    if (!bodyPost || bodyPost.status !== 'PUBLISHED') notFound()
    const closed = now >= fb.endAt.getTime() // endAt 이후 = 입력창 숨김, 목록만
    const bodyPostId = fb.bodyPostId
    return (
      <FeedbackDetail
        event={{ id: fb.id, title: fb.title, description: fb.description }}
        bodyHtml={bodyPost.content}
        closed={closed}
        commentsSlot={
          <Suspense fallback={CommentsFallback}>
            <FeedbackCommentsLoader postId={bodyPostId} readOnly={closed} />
          </Suspense>
        }
      />
    )
  }

  const select = {
    id: true, question: true, optionA: true, optionB: true, date: true,
    status: true, seedCountA: true, seedCountB: true, displayViews: true, linkedPostId: true,
  } as const
  // id는 VoteEvent id가 기본. 커뮤니티 상세에서 넘어온 경우 연동 게시글 id일 수 있어 linkedPostId로도 해석.
  let vote = await prisma.voteEvent.findUnique({ where: { id }, select }).catch(() => null)
  if (!vote) {
    vote = await prisma.voteEvent
      .findFirst({ where: { linkedPostId: id }, orderBy: { date: 'desc' }, select })
      .catch(() => null)
  }

  if (!vote) notFound()
  // 09:00 KST 전(HIDDEN) 예약 이벤트는 상세도 노출 금지 (새벽 노출 차단 정책 유지)
  if (voteVisibleStatus(vote.status, vote.date) === 'HIDDEN') notFound()

  return (
    <EventDetail
      vote={vote}
      linkedPostId={vote.linkedPostId ?? ''}
      commentsSlot={
        vote.linkedPostId ? (
          <Suspense
            fallback={
              <div className="max-w-[720px] mx-auto px-4 space-y-4">
                <div className="h-8 bg-muted rounded animate-pulse w-32" />
                <div className="h-20 bg-muted rounded-xl animate-pulse" />
              </div>
            }
          >
            <EventCommentsLoader postId={vote.linkedPostId} />
          </Suspense>
        ) : null
      }
    />
  )
}
