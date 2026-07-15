import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { voteVisibleStatus } from '@/lib/vote-status'
import { getCommentsByPostId } from '@/lib/queries/comments'
import CommentSection from '@/components/features/community/CommentSection'
import EventDetail from '@/components/features/event/EventDetail'

interface PageProps {
  params: Promise<{ id: string }>
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

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params

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
