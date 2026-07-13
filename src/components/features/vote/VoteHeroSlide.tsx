'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { VoteStatus } from './VoteWidget'

/** HERO 슬라이드용 서버 초기 데이터 — myChoice/집계는 ISR 캐시 오염 방지를 위해 클라 fetch로만 */
export interface VoteHeroData {
  id: string
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostUrl: string | null
}

const REFRESH_MS = 15_000

/** Day 1 전용 이모지 매핑 — 팝업과 동일 규칙 (그 외 옵션은 텍스트 그대로) */
function optionLabel(option: string): string {
  if (option === '잔소리형') return '🔥 잔소리형'
  if (option === '무뚝뚝형') return '🧊 무뚝뚝형'
  return option
}

/**
 * HERO 3번째 슬라이드 — 5:2 영역 안에서 바로 투표 가능한 코랄 미니 투표판.
 * 미투표+OPEN: 질문 + 흰 카드 버튼 2개 (참여자 수 문구 없음)
 * 투표 후/CLOSED: 결과 막대 2개 + 내 선택 + "이야기 보러 가기" (CLOSED는 딥네이비 "오늘의 결과")
 * 팝업/게시글과 동일 cookieId 기준 — mount fetch + 15초 refetch로 myChoice 동기화
 */
export default function VoteHeroSlide({
  vote: initial,
  onVoted,
}: {
  vote: VoteHeroData
  onVoted?: () => void
}) {
  const [live, setLive] = useState<VoteStatus | null>(null)
  const [pending, setPending] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/votes/today', { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as { vote: VoteStatus | null }
      if (mounted.current && data.vote && data.vote.id === initial.id) setLive(data.vote)
    } catch {
      /* 서버 초기값 유지 */
    }
  }, [initial.id])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [refresh])

  const cast = async (choice: 'A' | 'B') => {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch(`/api/votes/${initial.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ choice }),
      })
      const data = (await res.json()) as { vote?: VoteStatus }
      if (res.ok && data.vote) {
        setLive(data.vote)
        onVoted?.()
      } else {
        void refresh()
      }
    } catch {
      /* 유지 */
    } finally {
      setPending(false)
    }
  }

  const status = live?.status ?? initial.status
  const closed = status === 'CLOSED'
  const voted = live?.myChoice != null
  const showResult = voted || closed
  const postUrl = live?.linkedPostUrl ?? initial.linkedPostUrl ?? '/community/stories'

  const total = live?.total ?? 0
  const pctA = live && live.total > 0 ? Math.round((live.displayA / live.total) * 100) : 50
  const pctB = 100 - pctA

  return (
    <div
      className="absolute inset-0 flex flex-col justify-between px-5 py-3.5 lg:px-16 lg:py-7 text-white"
      style={{
        background: closed
          ? 'linear-gradient(135deg, #23303F 0%, #3A4A5C 100%)'
          : 'linear-gradient(135deg, #FF6F61 0%, #FF8E7A 100%)',
      }}
    >
      {/* 상단: 좌 라벨 / 우 마감 pill */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] lg:text-[16px] font-bold tracking-[0.3px] opacity-95">
          {closed ? '오늘의 결과' : '오늘의 투표'}
        </span>
        {!closed && (
          <span className="text-[13px] lg:text-[14px] font-semibold bg-white/25 rounded-full px-2.5 py-1 leading-none">
            밤 8시 마감
          </span>
        )}
      </div>

      {!showResult ? (
        <>
          {/* 미투표: 질문 + 흰 카드 버튼 2개 — 참여자 수 문구 없음 */}
          <h2
            className="m-0 font-bold leading-[1.3] break-keep"
            style={{ fontSize: 'clamp(18px, 5vw, 26px)', textShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
          >
            {initial.question}
          </h2>
          <div className="flex gap-2 lg:gap-3 lg:max-w-[560px]">
            <button
              onClick={() => void cast('A')}
              disabled={pending}
              aria-label={`${initial.optionA}에 투표`}
              className="flex-1 min-h-[52px] rounded-xl bg-white text-foreground font-bold text-[16px] lg:text-[18px] disabled:opacity-70 transition-opacity"
            >
              {optionLabel(initial.optionA)}
            </button>
            <button
              onClick={() => void cast('B')}
              disabled={pending}
              aria-label={`${initial.optionB}에 투표`}
              className="flex-1 min-h-[52px] rounded-xl bg-white text-foreground font-bold text-[16px] lg:text-[18px] disabled:opacity-70 transition-opacity"
            >
              {optionLabel(initial.optionB)}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* 결과: 컴팩트 막대 2줄 (질문은 라벨로 대체) */}
          <div className="flex flex-col gap-2 lg:gap-2.5 lg:max-w-[560px]">
            <HeroBar
              label={optionLabel(initial.optionA)}
              pct={live ? pctA : null}
              mine={live?.myChoice === 'A'}
              closed={closed}
            />
            <HeroBar
              label={optionLabel(initial.optionB)}
              pct={live ? pctB : null}
              mine={live?.myChoice === 'B'}
              closed={closed}
              delayMs={80}
            />
          </div>
          <Link
            href={postUrl}
            className="self-end text-[14px] lg:text-[15px] font-semibold text-white underline underline-offset-2 opacity-95"
          >
            {total > 0 ? `${total.toLocaleString()}명의 이야기 보러 가기 →` : '이야기 보러 가기 →'}
          </Link>
        </>
      )}
    </div>
  )
}

/** HERO 안 컴팩트 결과 막대 — 흰 반투명 트랙, 내 선택은 꽉 찬 흰색(CLOSED는 코랄) */
function HeroBar({
  label,
  pct,
  mine,
  closed,
  delayMs = 0,
}: {
  label: string
  pct: number | null
  mine: boolean
  closed: boolean
  delayMs?: number
}) {
  const target = pct ?? 0
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setWidth(target), 30 + delayMs)
    return () => clearTimeout(timer)
  }, [target, delayMs])

  return (
    <div className="flex items-center gap-2.5 text-[14px] lg:text-[15px]">
      <b className="w-[104px] lg:w-[120px] shrink-0 font-bold whitespace-nowrap overflow-hidden text-ellipsis">
        {mine ? '✓ ' : ''}
        {label}
      </b>
      <div
        className="flex-1 h-3 rounded-full bg-white/25 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct ?? '-'}%${mine ? ' (내 선택)' : ''}`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
            mine ? (closed ? 'bg-[#FF8E7A]' : 'bg-white') : 'bg-white/55',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-[42px] shrink-0 text-right font-bold tabular-nums">
        {pct !== null ? `${pct}%` : '—'}
      </span>
    </div>
  )
}
