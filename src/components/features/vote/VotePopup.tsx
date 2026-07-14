'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import BottomSheet from '@/components/ui/BottomSheet'
import { optionLabel } from './option-label'
import type { VoteStatus } from './VoteWidget'

const LS_PREFIX = 'unao-vote-popup-hide-'

/** 오늘 자정(로컬)까지 숨김 — vote id 기준 하루 1회 */
function isDismissedToday(voteId: string): boolean {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(`${LS_PREFIX}${voteId}`)
  if (!raw) return false
  const until = parseInt(raw, 10)
  return !isNaN(until) && Date.now() < until
}

function dismissToday(voteId: string): void {
  const midnight = new Date()
  midnight.setHours(23, 59, 59, 999)
  localStorage.setItem(`${LS_PREFIX}${voteId}`, String(midnight.getTime()))
}

/** 흰 카드형 선택 버튼 — 과한 테두리 없이, 누르면 코랄 tint 피드백만 */
function PopupChoice({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full min-h-[58px] rounded-2xl bg-white text-[19px] font-bold shadow-sm transition-colors duration-150',
        active ? 'bg-primary/10 text-primary-text' : 'text-foreground',
        'active:bg-primary/10 active:text-primary-text disabled:opacity-70',
      )}
    >
      {label}
    </button>
  )
}

export interface VotePopupViewProps {
  vote: Pick<VoteStatus, 'question' | 'optionA' | 'optionB'>
  pending?: boolean
  failed?: boolean
  /** 방금 누른 선택 — 이동 직전 컬러 피드백 */
  activeChoice?: 'A' | 'B' | null
  onCast: (choice: 'A' | 'B') => void
  onClose: () => void
  /** POST 실패 시 폴백 — 게시글에서 투표 */
  onGoToPost?: () => void
}

/**
 * 팝업 콘텐츠 (순수 프레젠테이션) — "투표 입구". 결과/투표 완료 화면 없음.
 * 질문 + 선택지 2개 + 작은 "오늘은 그만 보기"만. 선택 시 컨테이너가 POST→게시글 이동.
 * 참여자 수·설명문·결과 막대 전부 없음 (결과는 게시글에서).
 */
export function VotePopupView({
  vote,
  pending = false,
  failed = false,
  activeChoice = null,
  onCast,
  onClose,
  onGoToPost,
}: VotePopupViewProps) {
  const labelA = optionLabel(vote.optionA)
  const labelB = optionLabel(vote.optionB)

  return (
    <div>
      <p className="m-0 mb-2.5 inline-flex h-7 items-center rounded-full bg-[#FFF0EE] px-3 text-[13px] font-bold leading-none text-primary-text">
        오늘의 투표
      </p>
      <h3 className="m-0 mb-4 break-keep text-[25px] font-bold leading-[1.4] text-foreground">
        {vote.question}
      </h3>
      <div className="flex flex-col gap-2.5">
        <PopupChoice label={labelA} active={activeChoice === 'A'} disabled={pending} onClick={() => onCast('A')} />
        <PopupChoice label={labelB} active={activeChoice === 'B'} disabled={pending} onClick={() => onCast('B')} />
      </div>
      {failed && (
        <p className="m-0 mt-2 text-[14px] text-muted-foreground">
          투표가 안 됐어요. 한 번 더 눌러주세요.{' '}
          <button onClick={onGoToPost} className="underline font-bold text-foreground bg-transparent border-none p-0">
            게시글에서 투표하기
          </button>
        </p>
      )}
      <button
        onClick={onClose}
        className="mt-2 w-full min-h-[44px] bg-transparent text-[15px] text-muted-foreground"
      >
        오늘은 그만 보기
      </button>
    </div>
  )
}

/**
 * 홈 진입 시 오늘의 투표 입구 바텀시트 (미투표자 전용, 하루 1회).
 * ⚠️ 2026-07-13 창업자 요청으로 홈 비노출 중 — page.tsx 주석 해제 전까지 프로덕션 미사용.
 * - 선택 시 POST 1회 → 성공 즉시 linkedPostUrl 게시글로 이동 (결과는 게시글에서)
 * - 이미 투표한 사용자(myChoice 있음)는 노출하지 않는다
 * - 어드민 Popup이 활성 상태면 그쪽 우선 (기존 Popup 구조 무접촉)
 */
export default function VotePopup() {
  const router = useRouter()
  const [vote, setVote] = useState<VoteStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [activeChoice, setActiveChoice] = useState<'A' | 'B' | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        // 어드민 팝업 우선 — 홈 경로 활성 팝업이 있으면 양보
        const popupRes = await fetch('/api/popups?path=%2F', { credentials: 'same-origin' })
        if (popupRes.ok) {
          const popupData = (await popupRes.json()) as { popups?: unknown[] }
          if ((popupData.popups?.length ?? 0) > 0) return
        }

        const res = await fetch('/api/votes/today', { cache: 'no-store', credentials: 'same-origin' })
        if (!res.ok) return
        const data = (await res.json()) as { vote: VoteStatus | null }
        const v = data.vote
        // 미투표 + 진행 중 + 연동 게시글 있는 경우만, 하루 1회
        if (!v || v.status !== 'OPEN' || v.myChoice !== null || !v.linkedPostUrl || isDismissedToday(v.id)) return
        if (!cancelled) {
          setVote(v)
          setOpen(true)
        }
      } catch {
        /* 팝업은 부가 기능 — 실패 시 조용히 생략 */
      }
    }

    let idleId: number | undefined
    let timerId: ReturnType<typeof setTimeout> | undefined
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => void run())
    } else {
      timerId = setTimeout(() => void run(), 1500)
    }
    return () => {
      cancelled = true
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId)
      if (timerId !== undefined) clearTimeout(timerId)
    }
  }, [])

  if (!vote) return null

  const close = () => {
    dismissToday(vote.id)
    setOpen(false)
  }

  const goToPost = () => {
    dismissToday(vote.id)
    setOpen(false)
    if (vote.linkedPostUrl) router.push(vote.linkedPostUrl)
  }

  const cast = async (choice: 'A' | 'B') => {
    if (pending) return
    setActiveChoice(choice)
    setPending(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/votes/${vote.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ choice }),
      })
      const data = (await res.json()) as { vote?: VoteStatus }
      if (res.ok && data.vote) {
        // 입구 역할 종료 — 결과는 게시글에서. 당일 재노출 차단 후 즉시 이동.
        dismissToday(vote.id)
        const url = data.vote.linkedPostUrl ?? vote.linkedPostUrl
        setOpen(false)
        if (url) router.push(url)
      } else {
        setFailed(true)
        setActiveChoice(null)
        setPending(false)
      }
    } catch {
      setFailed(true)
      setActiveChoice(null)
      setPending(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={close}>
      <VotePopupView
        vote={vote}
        pending={pending}
        failed={failed}
        activeChoice={activeChoice}
        onCast={(c) => void cast(c)}
        onClose={close}
        onGoToPost={goToPost}
      />
    </BottomSheet>
  )
}
