import type { ReactNode } from 'react'
import Image from 'next/image'
import VoteWidget from '@/components/features/vote/VoteWidget'
import { effectiveVoteStatus } from '@/lib/vote-status'

/**
 * 공식 참여 이벤트 상세 (MVP 1A — 투표형). 사는이야기 게시글 상세가 아니라 "공식 참여 페이지".
 * 팝업/HERO/푸시/링크에서만 진입하는 히든 목적지 /events/[id] 의 본문.
 *
 * 모바일 첫 화면: 공식 라벨 → 제목 → 짧은 설명 → 투표 참여/결과(VoteWidget) → 댓글/진영 CTA.
 * ⚠️ 결과(%·막대)는 이 페이지(VoteWidget)에서만. 팝업/HERO에는 표시하지 않는다.
 */
export interface EventVoteData {
  id: string
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  date: Date
  seedCountA: number
  seedCountB: number
  displayViews: number
}

export default function EventDetail({
  vote,
  linkedPostId,
  commentsSlot,
}: {
  vote: EventVoteData
  linkedPostId: string
  commentsSlot: ReactNode
}) {
  const closed = effectiveVoteStatus(vote.status, vote.date) === 'CLOSED'

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8 bg-[var(--surface-warm)] min-h-screen">
      {/* ── 공식 헤더: 계정 + 참여 라벨 ── */}
      <div className="rounded-2xl bg-card border border-border shadow-sm p-4 md:p-5 mb-4">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 overflow-hidden shrink-0">
            <Image src="/logo-symbol.png" alt="우리 나이가 어때서" width={28} height={28} className="object-contain" />
          </span>
          <span className="text-caption font-bold text-foreground">우리 나이가 어때서</span>
          <span className="text-caption font-bold text-primary-text bg-primary/10 rounded-full px-2.5 py-1 leading-none">
            {closed ? '오늘의 결과' : '오늘의 참여'}
          </span>
        </div>

        {/* ── 제목(질문) + 짧은 설명 ── */}
        <h1 className="text-heading font-bold text-foreground m-0 leading-[1.35] break-keep">
          {vote.question}
        </h1>
        <p className="text-body text-muted-foreground m-0 mt-2 break-keep">
          {closed
            ? '오늘 참여해주신 결과예요. 아래에서 한마디도 나눠보세요.'
            : '우나어가 오늘 여러분께 여쭤봐요. 한 표 고르고, 이유도 댓글로 들려주세요.'}
        </p>

        {/* ── 참여/결과 영역 (VoteWidget) ── */}
        <VoteWidget
          voteEventId={vote.id}
          initialVote={{
            id: vote.id,
            question: vote.question,
            optionA: vote.optionA,
            optionB: vote.optionB,
            status: effectiveVoteStatus(vote.status, vote.date),
            linkedPostId,
            linkedPostUrl: null,
            displayA: vote.seedCountA,
            displayB: vote.seedCountB,
            total: vote.seedCountA + vote.seedCountB,
            displayViews: vote.displayViews,
            myChoice: null, // 클라 refetch로 보정
          }}
        />
      </div>

      {/* ── 댓글/진영 참여 (VoteWidget "한마디 남기기" → #vote-comment-anchor 스크롤) ── */}
      {commentsSlot}

      {/* ── 운영 안내 ── */}
      <p className="mt-6 text-center text-caption text-muted-foreground">
        남겨주신 참여와 의견은 우나어 운영에 소중히 반영됩니다.
      </p>
    </div>
  )
}
