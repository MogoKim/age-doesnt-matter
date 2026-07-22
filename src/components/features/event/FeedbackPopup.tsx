'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'

const LS_PREFIX = 'unao-feedback-popup-hide-'

/** 오늘 자정(로컬)까지 숨김 — eventId 기준 하루 1회 (VotePopup과 별도 키) */
function isDismissedToday(eventId: string): boolean {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(`${LS_PREFIX}${eventId}`)
  if (!raw) return false
  const until = parseInt(raw, 10)
  return !isNaN(until) && Date.now() < until
}
function dismissToday(eventId: string): void {
  const midnight = new Date()
  midnight.setHours(23, 59, 59, 999)
  localStorage.setItem(`${LS_PREFIX}${eventId}`, String(midnight.getTime()))
}

interface ExposedFeedback {
  eventId: string
  title: string
  description: string | null
}

/**
 * 홈 진입 시 **의견수렴형(FEEDBACK) 이벤트** 입구 바텀시트 (Phase 3b, 하루 1회).
 * - 입구 역할만: 제목 + 안내 + "의견 남기러 가기" → /events/[eventId] 이동. **의견 입력·결과·카운트 없음.**
 * - 노출 대상은 서버(getExposedFeedback: PRIMARY·showBottomPopup·window)가 결정 → VOTE와 배타(VotePopup과 동시 노출 X).
 * - 어드민 Popup이 활성 상태면 그쪽 우선(양보). VotePopup과 동일 규칙.
 */
export default function FeedbackPopup() {
  const router = useRouter()
  const [feedback, setFeedback] = useState<ExposedFeedback | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [popupRes, exposedRes] = await Promise.all([
          fetch('/api/popups?path=%2F', { credentials: 'same-origin' }),
          fetch('/api/events/exposed?channel=bottomPopup', { credentials: 'same-origin' }),
        ])
        // 홈 경로 활성 어드민 팝업이 있으면 양보
        if (popupRes.ok) {
          const popupData = (await popupRes.json()) as { popups?: unknown[] }
          if ((popupData.popups?.length ?? 0) > 0) return
        }
        if (!exposedRes.ok) return
        const data = (await exposedRes.json()) as { feedback: ExposedFeedback | null }
        const fb = data.feedback
        if (!fb || isDismissedToday(fb.eventId)) return
        if (!cancelled) {
          router.prefetch(`/events/${fb.eventId}`)
          setFeedback(fb)
          setOpen(true)
        }
      } catch {
        /* 팝업은 부가 기능 — 실패 시 조용히 생략 */
      }
    }
    const timerId = setTimeout(() => void run(), 200)
    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [router])

  if (!feedback) return null

  const close = () => {
    dismissToday(feedback.eventId)
    setOpen(false)
  }
  const goToEvent = () => {
    dismissToday(feedback.eventId)
    setOpen(false)
    router.push(`/events/${feedback.eventId}`)
  }

  return (
    <BottomSheet open={open} onClose={close}>
      <div>
        <p className="m-0 mb-2.5 inline-flex h-7 items-center rounded-full bg-[#FFF0EE] px-3 text-[13px] font-bold leading-none text-primary-text">
          의견 모아요
        </p>
        <h3 className="m-0 mb-3 break-keep text-[25px] font-bold leading-[1.4] text-foreground">
          {feedback.title}
        </h3>
        {feedback.description && (
          <p className="m-0 mb-4 break-keep text-[16px] leading-[1.6] text-muted-foreground">
            {feedback.description}
          </p>
        )}
        <button
          onClick={goToEvent}
          className="w-full min-h-[58px] rounded-2xl bg-primary text-[19px] font-bold text-white shadow-sm transition-colors duration-150 active:bg-primary/90"
        >
          의견 남기러 가기
        </button>
        <button
          onClick={close}
          className="mt-2 w-full min-h-[44px] bg-transparent text-[15px] text-muted-foreground"
        >
          오늘은 그만 보기
        </button>
      </div>
    </BottomSheet>
  )
}
