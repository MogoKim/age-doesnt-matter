'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
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

/**
 * 홈 진입 시 오늘의 투표 안내 바텀시트 (하루 1회).
 * - 어드민 Popup이 활성 상태면 그쪽 우선 — 이 팝업은 띄우지 않는다 (기존 Popup 구조 무접촉)
 * - 직접 투표 없음: CTA는 연동 게시글로 이동만
 */
export default function VotePopup() {
  const router = useRouter()
  const [vote, setVote] = useState<VoteStatus | null>(null)
  const [open, setOpen] = useState(false)

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
        // 진행 중 + 연동 게시글 있는 경우만, 하루 1회
        if (!v || v.status !== 'OPEN' || !v.linkedPostUrl || isDismissedToday(v.id)) return
        if (!cancelled) {
          setVote(v)
          setOpen(true)
        }
      } catch {
        /* 팝업은 부가 기능 — 실패 시 조용히 생략 */
      }
    }

    // 첫 렌더 체감 우선 — idle(또는 1500ms 폴백) 후 조회 (PopupRenderer와 동일 원칙)
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

  return (
    <BottomSheet open={open} onClose={close}>
      <p className="text-[15px] font-bold text-primary-text m-0 mb-2">오늘의 투표</p>
      <h3 className="text-[21px] font-bold text-foreground leading-[1.45] break-keep m-0 mb-2">
        {vote.question}
      </h3>
      <p className="text-[16px] text-muted-foreground m-0 mb-5">
        {vote.optionA} vs {vote.optionB} — 지금 {vote.total.toLocaleString()}명이 참여했어요.
      </p>
      <button
        onClick={() => {
          dismissToday(vote.id)
          setOpen(false)
          if (vote.linkedPostUrl) router.push(vote.linkedPostUrl)
        }}
        className="w-full min-h-[52px] rounded-xl bg-primary text-white text-[17px] font-bold hover:bg-primary/90 transition-colors"
      >
        오늘 투표 보러가기
      </button>
      <button
        onClick={close}
        className="w-full min-h-[48px] mt-1 text-[16px] text-muted-foreground bg-transparent border-none"
      >
        오늘은 그만 보기
      </button>
    </BottomSheet>
  )
}
