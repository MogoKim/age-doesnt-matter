'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/** /api/votes/today 응답 payload (src/lib/votes.ts VoteStatusPayload와 동일 형태) */
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
  source: 'banner' | 'post' | 'popup'
  /** post 소스: 현재 게시글 ID — 오늘 투표의 linkedPostId와 일치할 때만 렌더 */
  postId?: string
  /** 서버에서 미리 조회한 초기값 (첫 페인트 깜빡임 방지, banner용) */
  initialVote?: VoteStatus | null
}

const REFRESH_MS = 15_000

export default function VoteWidget({ source, postId, initialVote }: VoteWidgetProps) {
  const [vote, setVote] = useState<VoteStatus | null>(initialVote ?? null)
  const [loaded, setLoaded] = useState(Boolean(initialVote))
  const [pending, setPending] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/votes/today', { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as { vote: VoteStatus | null }
      if (mounted.current) {
        setVote(data.vote)
        setLoaded(true)
      }
    } catch {
      /* 조용히 유지 — 기존 상태 보존 */
    }
  }, [])

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
      if (!vote || pending || vote.status !== 'OPEN') return
      if (vote.myChoice === choice) return
      setPending(true)
      try {
        const res = await fetch(`/api/votes/${vote.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ choice }),
        })
        const data = (await res.json()) as { vote?: VoteStatus; error?: string }
        if (res.ok && data.vote) {
          setVote(data.vote)
        } else {
          // 중복/마감 등 — 서버 최신 상태로 동기화
          void refresh()
        }
      } catch {
        /* 네트워크 실패 — 상태 유지 */
      } finally {
        setPending(false)
      }
    },
    [vote, pending, refresh],
  )

  // post 소스: 이 글이 오늘 투표의 연동 글이 아니면 렌더하지 않음
  if (source === 'post' && (!vote || !postId || vote.linkedPostId !== postId)) return null
  if (!vote) {
    // banner 소스는 서버 분기에서 투표 존재를 확인하고 렌더되므로, 로딩 중 스켈레톤만
    if (source === 'banner' && !loaded) {
      return <div className="absolute inset-0 bg-gradient-to-br from-[#FF6F61] to-[#FF8E7A]" aria-hidden="true" />
    }
    return null
  }

  const pctA = vote.total > 0 ? Math.round((vote.displayA / vote.total) * 100) : 50
  const pctB = 100 - pctA
  const voted = vote.myChoice !== null
  const closed = vote.status === 'CLOSED'
  const showResult = voted || closed
  const campLabel = vote.myChoice === 'A' ? `${vote.optionA}파` : vote.myChoice === 'B' ? `${vote.optionB}파` : null
  const postHref = vote.linkedPostUrl

  /* ── HERO 배너 레이아웃 (aspect 5:2 부모 안 absolute) ── */
  if (source === 'banner') {
    return (
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-between px-5 py-3.5 lg:px-16 lg:py-6 text-white',
          closed
            ? 'bg-gradient-to-br from-[#23303F] to-[#3A4A5C]'
            : 'bg-gradient-to-br from-[#FF6F61] to-[#FF8E7A]',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold tracking-wide opacity-95">
            {closed ? '오늘의 결과' : '오늘의 투표'}
          </span>
          <span className="text-[12px] rounded-full bg-white/20 px-2.5 py-0.5">
            {closed ? `${vote.total.toLocaleString()}명 참여` : voted ? `내 선택: ${campLabel}` : '밤 8시 마감'}
          </span>
        </div>

        {!showResult ? (
          <>
            <h2 className="font-bold leading-[1.3] break-keep" style={{ fontSize: 'clamp(18px, 5vw, 26px)' }}>
              {vote.question}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => cast('A')}
                disabled={pending}
                className="flex-1 h-[52px] rounded-xl bg-white text-[16px] font-bold text-[#191F28] disabled:opacity-70"
              >
                {vote.optionA}
              </button>
              <button
                onClick={() => cast('B')}
                disabled={pending}
                className="flex-1 h-[52px] rounded-xl bg-white text-[16px] font-bold text-[#191F28] disabled:opacity-70"
              >
                {vote.optionB}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <ResultBar label={vote.optionA} pct={pctA} mine={vote.myChoice === 'A'} onGradient />
            <ResultBar label={vote.optionB} pct={pctB} mine={vote.myChoice === 'B'} onGradient />
            {postHref && (
              <Link href={postHref} className="self-end text-[13px] text-white/95 underline underline-offset-2">
                {vote.total.toLocaleString()}명의 이야기 보러 가기 →
              </Link>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ── 게시글/팝업 카드 레이아웃 — 실시간 결과 상시 공개 + 나도 한 표 ── */
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-4">
      <p className="text-caption font-bold text-primary-text m-0 mb-1.5">
        {closed ? '오늘의 결과' : '실시간 현황'} · {vote.total.toLocaleString()}명 참여
      </p>
      <h3 className="text-lg font-bold text-foreground m-0 mb-4 leading-[1.4] break-keep">{vote.question}</h3>

      {/* 결과 막대 — 투표 여부와 무관하게 항상 공개 */}
      <div className="flex flex-col gap-3 mb-4">
        <ResultBar label={vote.optionA} pct={pctA} mine={vote.myChoice === 'A'} />
        <ResultBar label={vote.optionB} pct={pctB} mine={vote.myChoice === 'B'} />
      </div>

      {!closed && !voted && (
        <>
          <p className="text-[15px] font-bold text-foreground m-0 mb-2">나도 한 표 —</p>
          <div className="flex gap-2">
            <button
              onClick={() => cast('A')}
              disabled={pending}
              className="flex-1 h-[52px] rounded-xl border border-border bg-background text-[16px] font-bold text-foreground hover:border-primary hover:text-primary-text transition-colors disabled:opacity-70"
            >
              {vote.optionA}
            </button>
            <button
              onClick={() => cast('B')}
              disabled={pending}
              className="flex-1 h-[52px] rounded-xl border border-border bg-background text-[16px] font-bold text-foreground hover:border-primary hover:text-primary-text transition-colors disabled:opacity-70"
            >
              {vote.optionB}
            </button>
          </div>
          <p className="text-caption text-muted-foreground text-center m-0 mt-2.5">
            투표해도 실시간 결과는 계속 보여요 · 마감 전까지 변경 가능
          </p>
        </>
      )}

      {!closed && voted && campLabel && (
        <>
          <p className="text-[15px] font-bold text-foreground m-0 mb-2">
            {campLabel}가 되셨네요 — 왜 그쪽인가요?
          </p>
          <button
            onClick={() => {
              document
                .getElementById('vote-comment-anchor')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="w-full h-[52px] rounded-xl bg-primary text-white text-[16px] font-bold hover:bg-primary/90 transition-colors"
          >
            💬 {campLabel} 한마디 남기기
          </button>
        </>
      )}

      {closed && (
        <p className="text-caption text-muted-foreground text-center m-0">
          오늘 투표가 마감됐어요 — 내일 아침 10시에 새 투표가 열려요
        </p>
      )}
    </div>
  )
}

function ResultBar({
  label,
  pct,
  mine,
  onGradient = false,
}: {
  label: string
  pct: number
  mine: boolean
  onGradient?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          'w-24 shrink-0 text-[14.5px] font-bold truncate',
          onGradient ? 'text-white' : mine ? 'text-primary-text' : 'text-foreground',
        )}
      >
        {label}
      </span>
      <div
        className={cn('flex-1 h-3 rounded-md overflow-hidden', onGradient ? 'bg-white/25' : 'bg-muted')}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct}%`}
      >
        <div
          className={cn(
            'h-full rounded-md transition-[width] duration-300',
            onGradient ? (mine ? 'bg-white' : 'bg-white/55') : mine ? 'bg-primary' : 'bg-[#D6DBE0]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'w-11 shrink-0 text-right text-[14.5px] tabular-nums',
          onGradient ? 'text-white' : 'text-muted-foreground',
          mine && 'font-bold',
          mine && !onGradient && 'text-primary-text',
        )}
      >
        {pct}%
      </span>
    </div>
  )
}
