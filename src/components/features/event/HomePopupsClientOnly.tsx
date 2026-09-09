'use client'

import dynamic from 'next/dynamic'

/**
 * 홈 팝업 3종 — Next 16 전환(2026-09-09)으로 client 경계로 옮겼다.
 *
 * Next 15+ 부터 Server Component 에서 `ssr: false` 를 쓸 수 없다. `(main)/page.tsx` 가
 * Server Component 라 선언만 여기로 옮겼고, **지연 로딩 의도와 렌더 순서는 그대로**다 —
 * 셋 다 above-the-fold 가 아닌 모달이라 초기 번들·hydration 에서 빼는 것이 목적이었다(CLS 0).
 * 트리거·배타 규칙(VOTE / FEEDBACK / SURVEY 중 하나)은 각 컴포넌트 안에 그대로 있다.
 */

const VotePopup = dynamic(() => import('@/components/features/vote/VotePopup'), { ssr: false, loading: () => null })
const FeedbackPopup = dynamic(() => import('@/components/features/event/FeedbackPopup'), { ssr: false, loading: () => null })
const SurveyPopup = dynamic(() => import('@/components/features/event/SurveyPopup'), { ssr: false, loading: () => null })

export default function HomePopupsClientOnly() {
  return (
    <>
      {/* 오늘의 투표 입구 바텀시트 — 미투표자 하루 1회, 선택 즉시 게시글 이동(결과 미표시), 어드민 팝업 양보 */}
      <VotePopup />
      {/* 의견수렴형 이벤트 입구 바텀시트 (Phase 3b) — VOTE와 배타(서버 getExposedEvent 1개), 하루 1회, 어드민 팝업 양보 */}
      <FeedbackPopup />
      {/* 1분 의견함(SURVEY) 입구 바텀시트 (Phase 5) — VOTE/FEEDBACK과 배타, 하루 1회, 입구만(설문 폼 없음) */}
      <SurveyPopup />
    </>
  )
}
