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

export type VotePopupPhase = 'vote' | 'done'

export interface VotePopupViewProps {
  vote: VoteStatus
  phase: VotePopupPhase
  pending?: boolean
  failed?: boolean
  /** preview 전용 — 마감 상태 화면 (실제 홈에서는 CLOSED면 팝업 자체가 안 뜸) */
  closed?: boolean
  onCast: (choice: 'A' | 'B') => void
  onGoToPost: () => void
  onClose: () => void
}

/**
 * 팝업 콘텐츠 (순수 프레젠테이션) — VotePopup(홈 컨테이너)과 dev preview가 공유.
 * 디자인 기준(창업자 2026-07-13): 시트 높이 화면 42~50% 이내 / pill 작게 / 질문 24~26px /
 * 설명문 없음 / 버튼 56~60px·글자 18~20px·간격 10~12px / "그만 보기" 15~16px 보조 텍스트 /
 * 미투표 화면에 참여자 수 문구 없음.
 */
export function VotePopupView({
  vote,
  phase,
  pending = false,
  failed = false,
  closed = false,
  onCast,
  onGoToPost,
  onClose,
}: VotePopupViewProps) {
  const pctA = vote.total > 0 ? Math.round((vote.displayA / vote.total) * 100) : 50
  const pctB = 100 - pctA
  const labelA = vote.optionA === '잔소리형' ? '🔥 잔소리형' : vote.optionA
  const labelB = vote.optionB === '무뚝뚝형' ? '🧊 무뚝뚝형' : vote.optionB
  const showResult = phase === 'done' || closed

  return !showResult ? (
    <div>
      <p className="m-0 mb-2.5 inline-flex h-7 items-center rounded-full bg-[#FFF0EE] px-3 text-[13px] font-bold leading-none text-primary-text">
        오늘의 투표
      </p>
      <h3 className="m-0 mb-4 break-keep text-[25px] font-bold leading-[1.4] text-foreground">
        {vote.question}
      </h3>
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => onCast('A')}
          disabled={pending}
          className="w-full min-h-[58px] rounded-2xl border border-[#E3E7EC] bg-white text-[19px] font-bold text-foreground transition-colors hover:border-primary hover:text-primary-text disabled:opacity-60"
        >
          {labelA}
        </button>
        <button
          onClick={() => onCast('B')}
          disabled={pending}
          className="w-full min-h-[58px] rounded-2xl border border-[#E3E7EC] bg-white text-[19px] font-bold text-foreground transition-colors hover:border-primary hover:text-primary-text disabled:opacity-60"
        >
          {labelB}
        </button>
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
  ) : (
    <div>
      <p className="m-0 mb-2.5 inline-flex h-7 items-center rounded-full bg-[#FFF0EE] px-3 text-[13px] font-bold leading-none text-primary-text">
        {closed ? '오늘의 결과' : '투표 완료!'}
      </p>
      <h3 className="m-0 mb-3 break-keep text-[18px] font-bold leading-[1.4] text-foreground">
        {vote.question}
      </h3>
      <div className="flex flex-col gap-2.5">
        <ResultRow label={vote.optionA} pct={pctA} mine={vote.myChoice === 'A'} animate />
        <ResultRow label={vote.optionB} pct={pctB} mine={vote.myChoice === 'B'} animate delayMs={80} />
      </div>
      {!closed && (
        <p className="m-0 mt-2 text-[14px] text-muted-foreground">마감 전까지 선택을 바꿀 수 있어요.</p>
      )}
      <button
        onClick={onGoToPost}
        className="mt-3 w-full min-h-[52px] rounded-2xl bg-primary text-[17px] font-bold text-white transition-colors hover:bg-primary/90"
      >
        {closed ? '사람들의 이야기 보러가기' : '사람들은 왜 그쪽인지 보러가기'}
      </button>
      <button
        onClick={onClose}
        className="mt-0.5 w-full min-h-[40px] bg-transparent text-[15px] text-muted-foreground"
      >
        닫기
      </button>
    </div>
  )
}

/**
 * 홈 진입 시 오늘의 투표 직접투표 바텀시트 (미투표자 전용, 하루 1회).
 * ⚠️ 2026-07-13 창업자 요청으로 홈 비노출 중 — page.tsx 주석 해제 전까지 프로덕션 미사용.
 * - 이미 투표한 사용자(myChoice 있음)는 노출하지 않는다
 * - 어드민 Popup이 활성 상태면 그쪽 우선 (기존 Popup 구조 무접촉)
 * - 투표 성공 시점에 당일 재노출 차단(LS)
 */
export default function VotePopup() {
  const router = useRouter()
  const [vote, setVote] = useState<VoteStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<VotePopupPhase>('vote')
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

  return (
    <BottomSheet open={open} onClose={close}>
      <VotePopupView
        vote={vote}
        phase={phase}
        pending={pending}
        failed={failed}
        onCast={(c) => void cast(c)}
        onGoToPost={goToPost}
        onClose={close}
      />
    </BottomSheet>
  )
}
