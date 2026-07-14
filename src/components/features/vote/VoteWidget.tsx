'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { optionLabel, campPhrase, eulReul } from './option-label'

/** /api/votes/[id] 응답 payload (src/lib/votes.ts VoteStatusPayload와 동일 형태) */
export interface VoteStatus {
  id: string
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostId: string | null
  linkedPostUrl: string | null
  displayA: number
  displayB: number
  total: number
  displayViews: number
  myChoice: 'A' | 'B' | null
}

interface VoteWidgetProps {
  /** 이 게시글에 연동된 투표 ID (서버에서 판별 후 전달) */
  voteEventId: string
  /** 서버 프리페치 초기값 — 첫 페인트 깜빡임 방지 (myChoice는 클라 refetch로 보정) */
  initialVote?: VoteStatus | null
}

const REFRESH_MS = 15_000

/**
 * 투표형 게시글 참여 모듈 — 제목 아래·본문 위 배치.
 * 질문 / 선택지 / 결과 / 댓글 CTA만. (실표+seed 합산 표시, BOT 제외 — 서버 집계)
 */
export default function VoteWidget({ voteEventId, initialVote }: VoteWidgetProps) {
  const [vote, setVote] = useState<VoteStatus | null>(initialVote ?? null)
  const [pending, setPending] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/votes/${voteEventId}`, { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as { vote: VoteStatus | null }
      if (mounted.current && data.vote) setVote(data.vote)
    } catch {
      /* 기존 상태 유지 */
    }
  }, [voteEventId])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [refresh])

  const cast = useCallback(
    async (choice: 'A' | 'B') => {
      if (!vote || pending || vote.status !== 'OPEN' || vote.myChoice === choice) return
      setPending(true)
      try {
        const res = await fetch(`/api/votes/${vote.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ choice }),
        })
        const data = (await res.json()) as { vote?: VoteStatus }
        if (res.ok && data.vote) setVote(data.vote)
        else void refresh()
      } catch {
        /* 유지 */
      } finally {
        setPending(false)
      }
    },
    [vote, pending, refresh],
  )

  if (!vote) return null

  const pctA = vote.total > 0 ? Math.round((vote.displayA / vote.total) * 100) : 50
  const pctB = 100 - pctA
  const closed = vote.status === 'CLOSED'
  const voted = vote.myChoice !== null
  const showResult = voted || closed

  const myOption = vote.myChoice === 'A' ? vote.optionA : vote.myChoice === 'B' ? vote.optionB : ''
  const gap = Math.abs(pctA - pctB)
  const leadOption = pctA >= pctB ? vote.optionA : vote.optionB
  // 우세/팽팽 마이크로카피 — 과장 없이, 격차 구간별
  const leadCopy = gap <= 3 ? '지금 팽팽해요' : gap > 8 ? `지금은 ${optionLabel(leadOption)} 쪽이 조금 앞서요` : ''
  const votedHeadline = myOption ? `${optionLabel(myOption)}${eulReul(myOption)} 고르셨네요` : ''
  const closedHeadline = gap <= 3 ? '오늘은 딱 반반이었어요' : `오늘은 ${optionLabel(leadOption)} 쪽이 더 많았어요`

  const scrollToComment = () =>
    document.getElementById('vote-comment-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <div className="my-5 border-y border-border py-6">
      {/* 제목이 곧 질문(투표형 게시글 제목=질문 기반) — 위젯에서 질문 반복 금지, 라벨만 */}
      <p className="text-[13px] font-bold text-primary-text m-0 mb-4 tracking-[0.2px]">
        {closed ? '오늘의 결과' : '오늘의 투표 · 밤 8시 마감'}
      </p>

      {!showResult ? (
        /* 미투표 + 진행 중: 결과 비공개 + 선택 버튼 */
        <>
          <p className="text-[16px] text-muted-foreground m-0 mb-4">먼저 한 표 고르면 결과가 보여요.</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => cast('A')}
              disabled={pending}
              className="w-full min-h-[56px] rounded-xl border border-[#E3E7EC] bg-white text-[18px] font-bold text-foreground hover:border-primary hover:text-primary-text active:bg-primary/5 transition-colors disabled:opacity-60"
            >
              {optionLabel(vote.optionA)}
            </button>
            <button
              onClick={() => cast('B')}
              disabled={pending}
              className="w-full min-h-[56px] rounded-xl border border-[#E3E7EC] bg-white text-[18px] font-bold text-foreground hover:border-primary hover:text-primary-text active:bg-primary/5 transition-colors disabled:opacity-60"
            >
              {optionLabel(vote.optionB)}
            </button>
          </div>
        </>
      ) : (
        /* 결과: 내 진영 헤드라인 + 막대(내 진영 진하게) + 우세 카피 + 진영 CTA */
        <>
          <p className="text-[17px] font-bold text-foreground m-0 mb-4 break-keep">
            {closed ? closedHeadline : votedHeadline}
          </p>
          <div className="flex flex-col gap-4">
            <ResultRow label={optionLabel(vote.optionA)} pct={pctA} mine={vote.myChoice === 'A'} />
            <ResultRow label={optionLabel(vote.optionB)} pct={pctB} mine={vote.myChoice === 'B'} />
          </div>
          <p className="text-[15px] text-muted-foreground m-0 mt-3">
            {vote.total.toLocaleString()}명 참여
            {!closed && leadCopy && ` · ${leadCopy}`}
            {!closed && !leadCopy && ' · 마감 전까지 선택을 바꿀 수 있어요'}
          </p>
          <button
            onClick={scrollToComment}
            className="mt-4 w-full min-h-[52px] rounded-xl bg-primary text-white text-[17px] font-bold hover:bg-primary/90 transition-colors"
          >
            {closed ? '결과 보고 한마디 남기기' : voted ? campPhrase(myOption, '한마디') : '한마디 남기기'}
          </button>
        </>
      )}
    </div>
  )
}

/** 결과 막대 한 줄 — VotePopup과 공용. animate=true면 mount 시 0%→pct 펼침(500ms, delayMs 지연). */
export function ResultRow({
  label,
  pct,
  mine,
  animate = false,
  delayMs = 0,
}: {
  label: string
  pct: number
  mine: boolean
  animate?: boolean
  delayMs?: number
}) {
  // 펼침 애니: 첫 페인트를 0%로 커밋한 뒤 실값으로 전환 (% 숫자는 즉시 표시 — 카운트업 금지)
  const [barPct, setBarPct] = useState(animate ? 0 : pct)
  useEffect(() => {
    if (!animate) {
      setBarPct(pct)
      return
    }
    const timer = setTimeout(() => setBarPct(pct), 30 + delayMs)
    return () => clearTimeout(timer)
  }, [animate, pct, delayMs])

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className={cn('text-[17px] font-bold', mine ? 'text-primary-text' : 'text-foreground')}>
          {label}
          {mine && (
            <span className="ml-2 align-middle inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-bold bg-primary text-white leading-none">
              내 선택
            </span>
          )}
        </span>
        <span className={cn('text-[18px] font-extrabold tabular-nums', mine ? 'text-primary-text' : 'text-muted-foreground')}>
          {pct}%
        </span>
      </div>
      <div
        className="h-4 rounded-lg bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct}%`}
      >
        <div
          className={cn(
            'h-full rounded-lg transition-[width] ease-out motion-reduce:transition-none',
            animate ? 'duration-500' : 'duration-300',
            mine ? 'bg-primary' : 'bg-[#C9CFD6]',
          )}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  )
}
