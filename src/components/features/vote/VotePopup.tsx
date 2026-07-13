'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import { ResultRow, type VoteStatus } from './VoteWidget'

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
 * 홈 진입 시 오늘의 투표 직접투표 바텀시트 (미투표자 전용, 하루 1회).
 * - 목적: 첫 진입에서 바로 한 표 → 결과 확인 → 게시글 댓글 동선
 * - 이미 투표한 사용자(myChoice 있음)는 노출하지 않는다 — 확정 정책 5
 * - 어드민 Popup이 활성 상태면 그쪽 우선 — 이 팝업은 띄우지 않는다 (기존 Popup 구조 무접촉)
 * - 투표 성공 시점에 당일 재노출 차단(LS) — 결과 화면은 그 자리에서 1회만
 */
export default function VotePopup() {
  const router = useRouter()
  const [vote, setVote] = useState<VoteStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'vote' | 'done'>('vote')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

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

  const goToPost = () => {
    dismissToday(vote.id)
    setOpen(false)
    if (vote.linkedPostUrl) router.push(vote.linkedPostUrl)
  }

  const cast = async (choice: 'A' | 'B') => {
    if (pending) return
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
        setVote(data.vote)
        setPhase('done')
        // 투표 = 오늘 팝업 목적 달성 — 당일 재노출 차단 (결과 화면은 지금 이 자리 1회)
        dismissToday(vote.id)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  const pctA = vote.total > 0 ? Math.round((vote.displayA / vote.total) * 100) : 50
  const pctB = 100 - pctA

  return (
    <BottomSheet open={open} onClose={close}>
      {phase === 'vote' ? (
        <>
          <p className="text-[15px] font-bold text-primary-text m-0 mb-2">오늘의 투표</p>
          <h3 className="text-[21px] font-bold text-foreground leading-[1.45] break-keep m-0 mb-5">
            {vote.question}
          </h3>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => void cast('A')}
              disabled={pending}
              className="w-full min-h-[56px] rounded-xl border-2 border-border bg-background text-[18px] font-bold text-foreground hover:border-primary hover:text-primary-text transition-colors disabled:opacity-60"
            >
              {vote.optionA}
            </button>
            <button
              onClick={() => void cast('B')}
              disabled={pending}
              className="w-full min-h-[56px] rounded-xl border-2 border-border bg-background text-[18px] font-bold text-foreground hover:border-primary hover:text-primary-text transition-colors disabled:opacity-60"
            >
              {vote.optionB}
            </button>
          </div>
          {failed && (
            <p className="text-[15px] text-muted-foreground m-0 mt-3">
              투표가 안 됐어요. 한 번 더 눌러주세요.{' '}
              <button onClick={goToPost} className="underline font-bold text-foreground bg-transparent border-none p-0">
                게시글에서 투표하기
              </button>
            </p>
          )}
          <p className="text-[15px] text-muted-foreground m-0 mt-4">
            지금 {vote.total.toLocaleString()}명 참여 · 밤 8시 마감
          </p>
          <button
            onClick={close}
            className="w-full min-h-[48px] mt-3 text-[16px] text-muted-foreground bg-transparent border-none"
          >
            오늘은 그만 보기
          </button>
        </>
      ) : (
        <>
          <p className="text-[15px] font-bold text-primary-text m-0 mb-2">투표 완료!</p>
          <h3 className="text-[21px] font-bold text-foreground leading-[1.45] break-keep m-0 mb-5">
            {vote.question}
          </h3>
          <div className="flex flex-col gap-4">
            <ResultRow label={vote.optionA} pct={pctA} mine={vote.myChoice === 'A'} animate />
            <ResultRow label={vote.optionB} pct={pctB} mine={vote.myChoice === 'B'} animate delayMs={80} />
          </div>
          <p className="text-[15px] text-muted-foreground m-0 mt-4">
            {vote.total.toLocaleString()}명 참여 · 마감 전까지 선택을 바꿀 수 있어요
          </p>
          <button
            onClick={goToPost}
            className="w-full min-h-[52px] mt-4 rounded-xl bg-primary text-white text-[17px] font-bold hover:bg-primary/90 transition-colors"
          >
            사람들은 왜 그쪽인지 보러가기
          </button>
          <button
            onClick={close}
            className="w-full min-h-[48px] mt-1 text-[16px] text-muted-foreground bg-transparent border-none"
          >
            닫기
          </button>
        </>
      )}
    </BottomSheet>
  )
}
