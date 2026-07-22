'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'

const LS_PREFIX = 'unao-survey-popup-hide-'

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

interface ExposedSurvey {
  eventId: string
  title: string
  description: string | null
}

/**
 * 홈 진입 시 **1분 의견함(SURVEY)** 입구 바텀시트 (Phase 5, 하루 1회).
 * - 입구 역할만: 제목 + 안내 + "1분 의견 남기러 가기" → /events/[eventId]?src=popup. **설문 입력 폼 없음.**
 * - 노출 대상은 서버(getExposedSurvey: PRIMARY·showBottomPopup·window)가 결정 → VOTE/FEEDBACK과 배타.
 * - 어드민 Popup 활성 시 양보. VotePopup/FeedbackPopup과 동시 노출 X(채널당 1개).
 */
export default function SurveyPopup() {
  const router = useRouter()
  const [survey, setSurvey] = useState<ExposedSurvey | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [popupRes, exposedRes] = await Promise.all([
          fetch('/api/popups?path=%2F', { credentials: 'same-origin' }),
          fetch('/api/events/exposed?channel=bottomPopup', { credentials: 'same-origin' }),
        ])
        if (popupRes.ok) {
          const popupData = (await popupRes.json()) as { popups?: unknown[] }
          if ((popupData.popups?.length ?? 0) > 0) return
        }
        if (!exposedRes.ok) return
        const data = (await exposedRes.json()) as { survey: ExposedSurvey | null }
        const s = data.survey
        if (!s || isDismissedToday(s.eventId)) return
        if (!cancelled) {
          router.prefetch(`/events/${s.eventId}`)
          setSurvey(s)
          setOpen(true)
        }
      } catch {
        /* 부가 기능 — 실패 시 조용히 생략 */
      }
    }
    const timerId = setTimeout(() => void run(), 200)
    return () => { cancelled = true; clearTimeout(timerId) }
  }, [router])

  if (!survey) return null

  const close = () => { dismissToday(survey.eventId); setOpen(false) }
  const goToEvent = () => { dismissToday(survey.eventId); setOpen(false); router.push(`/events/${survey.eventId}?src=popup`) }

  return (
    <BottomSheet open={open} onClose={close}>
      <div>
        <p className="m-0 mb-2.5 inline-flex h-7 items-center rounded-full bg-[#EEF2FF] px-3 text-[13px] font-bold leading-none text-[#4F46E5]">
          📝 1분 의견함
        </p>
        <h3 className="m-0 mb-3 break-keep text-[25px] font-bold leading-[1.4] text-foreground">{survey.title}</h3>
        {survey.description && (
          <p className="m-0 mb-4 break-keep text-[16px] leading-[1.6] text-muted-foreground">{survey.description}</p>
        )}
        <button
          onClick={goToEvent}
          className="w-full min-h-[58px] rounded-2xl bg-primary text-[19px] font-bold text-white shadow-sm transition-colors duration-150 active:bg-primary/90"
        >
          1분 의견 남기러 가기
        </button>
        <button onClick={close} className="mt-2 w-full min-h-[44px] bg-transparent text-[15px] text-muted-foreground">
          오늘은 그만 보기
        </button>
      </div>
    </BottomSheet>
  )
}
