import type { ReactNode } from 'react'
import Image from 'next/image'

/**
 * 공식 참여 이벤트 상세 — **의견수렴형(FEEDBACK)** (Phase 3a).
 * 사는이야기 게시글 상세가 아니라 "공식 참여 페이지". 팝업/HERO/푸시/링크에서만 진입하는 히든 목적지.
 *
 * 구조: 공식 헤더(계정+참여 라벨) → 제목 → 안내문 → 운영자 본문 → 의견 입력/목록 → 운영 안내.
 * ⚠️ VoteWidget·A/B·투표 결과·진영 배지 **없음**. 결과/%/막대 표시 금지.
 */
export interface FeedbackEventData {
  id: string
  title: string
  description: string | null
}

export default function FeedbackDetail({
  event,
  bodyHtml,
  closed,
  commentsSlot,
}: {
  event: FeedbackEventData
  bodyHtml: string
  /** endAt 이후 = 마감(의견 입력창 숨김, 목록만 읽기). commentsSlot 쪽 readOnly와 함께 사용 */
  closed: boolean
  commentsSlot: ReactNode
}) {
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
            {closed ? '마감된 의견' : '의견 모아요'}
          </span>
        </div>

        {/* ── 제목 + 안내문 ── */}
        <h1 className="text-heading font-bold text-foreground m-0 leading-[1.35] break-keep">
          {event.title}
        </h1>
        {event.description && (
          <p className="text-body text-muted-foreground m-0 mt-2 break-keep">{event.description}</p>
        )}

        {/* ── 운영자 본문(안내글) ── */}
        <div
          className="mt-4 post-content leading-[1.7] text-foreground break-keep [&_p]:m-0 [&_p]:mb-2.5 [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>

      {/* ── 의견 입력/목록 (CommentSection variant='feedback') ── */}
      {commentsSlot}

      {/* ── 운영 안내 ── */}
      <p className="mt-6 text-center text-caption text-muted-foreground">
        {closed
          ? '남겨주신 의견은 우나어 운영에 소중히 반영됩니다. (의견 받기가 마감됐어요)'
          : '남겨주신 의견은 우나어 운영에 소중히 반영됩니다.'}
      </p>
    </div>
  )
}
