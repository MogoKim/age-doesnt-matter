'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { optionLabel } from './option-label'
import type { VoteStatus } from './VoteWidget'

/** HERO 슬라이드용 서버 초기 데이터 — 입구 렌더에 필요한 정적 정보만 (집계 없음) */
export interface VoteHeroData {
  id: string
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostUrl: string | null
}

const REFRESH_MS = 30_000

/** HERO 안 흰 버튼 — 누르면 코랄 채움 피드백만 (결과 아님, 이동 직전 표시) */
function HeroChoice({
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
      aria-label={`${label}에 투표`}
      className={cn(
        'flex-1 min-h-[52px] rounded-xl font-bold text-[16px] lg:text-[18px] transition-colors duration-150 disabled:opacity-80',
        active ? 'bg-primary/90 text-white' : 'bg-white text-foreground',
      )}
    >
      {label}
    </button>
  )
}

export interface VoteHeroSlideViewProps {
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  postUrl: string
  /** 내 선택 — null=미투표(버튼 노출), 'A'/'B'=이미 투표(버튼 숨김) */
  myChoice?: 'A' | 'B' | null
  activeChoice?: 'A' | 'B' | null
  pending?: boolean
  onCast: (choice: 'A' | 'B') => void
}

/**
 * HERO 3번째 슬라이드 콘텐츠 (순수 프레젠테이션) — "투표 입구". 결과판이 아니다.
 * - 배경 전체에 게시글로 가는 Link를 깔고(버튼 외 영역 클릭 → 투표 없이 게시글 이동),
 *   콘텐츠는 pointer-events-none, A/B 버튼만 pointer-events-auto(버튼 클릭 → 투표 후 이동).
 * - OPEN+미투표: A/B 버튼 / OPEN+투표완료: 참여 상태만 / CLOSED: 결과 보러 가기 입구.
 * - ⚠️ 결과 막대·%·집계는 절대 표시하지 않는다(결과는 게시글 상세에서만).
 */
export function VoteHeroSlideView({
  question,
  optionA,
  optionB,
  status,
  postUrl,
  myChoice = null,
  activeChoice = null,
  pending = false,
  onCast,
}: VoteHeroSlideViewProps) {
  const closed = status === 'CLOSED'
  const voted = myChoice !== null
  const myOption = myChoice === 'A' ? optionLabel(optionA) : myChoice === 'B' ? optionLabel(optionB) : ''

  if (closed) {
    return (
      <div
        className="absolute inset-0 text-white"
        style={{ background: 'linear-gradient(135deg, #23303F 0%, #3A4A5C 100%)' }}
      >
        {/* 배경 전체 클릭 → 게시글(결과)로 이동 */}
        <Link href={postUrl} aria-label="오늘의 투표 결과 보러 가기" className="absolute inset-0 z-0" />
        <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between px-5 py-3.5 lg:px-16 lg:py-7">
          <span className="text-[14px] lg:text-[16px] font-bold tracking-[0.3px] opacity-95">오늘의 결과</span>
          <h2
            className="m-0 font-bold leading-[1.3] break-keep"
            style={{ fontSize: 'clamp(18px, 5vw, 26px)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
          >
            {question}
          </h2>
          <span className="self-end text-[14px] lg:text-[15px] font-semibold text-white underline underline-offset-2 opacity-95">
            결과 보러 가기 →
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 text-white"
      style={{ background: 'linear-gradient(135deg, #FF6F61 0%, #FF8E7A 100%)' }}
    >
      {/* 배경 전체 클릭 → 투표 없이 게시글로 이동 (버튼은 위에서 pointer-events로 가로챔) */}
      <Link href={postUrl} aria-label="오늘의 투표 게시글 보기" className="absolute inset-0 z-0" />
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between px-5 py-3.5 lg:px-16 lg:py-7">
        <div className="flex items-center justify-between">
          <span className="text-[14px] lg:text-[16px] font-bold tracking-[0.3px] opacity-95">오늘의 투표</span>
          <span className="text-[13px] lg:text-[14px] font-semibold bg-white/25 rounded-full px-2.5 py-1 leading-none">
            밤 8시 마감
          </span>
        </div>
        <h2
          className="m-0 font-bold leading-[1.3] break-keep"
          style={{ fontSize: 'clamp(18px, 5vw, 26px)', textShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
        >
          {question}
        </h2>

        {voted ? (
          // 이미 투표 — 버튼 숨김, 참여 상태만 (결과 없음). 영역 클릭 시 배경 Link로 이동
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] lg:text-[17px] font-semibold bg-white/25 rounded-full px-3 py-1.5 leading-none">
              참여 완료{myOption ? ` · 내 선택: ${myOption}` : ''}
            </span>
            <span className="text-[14px] lg:text-[15px] font-semibold text-white underline underline-offset-2 opacity-95">
              게시글 보기 →
            </span>
          </div>
        ) : (
          // 미투표 — A/B 버튼만 pointer-events-auto (버튼=투표 후 이동)
          <div className="pointer-events-auto flex gap-2 lg:gap-3 lg:max-w-[560px]">
            <HeroChoice label={optionLabel(optionA)} active={activeChoice === 'A'} disabled={pending} onClick={() => onCast('A')} />
            <HeroChoice label={optionLabel(optionB)} active={activeChoice === 'B'} disabled={pending} onClick={() => onCast('B')} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * HERO 3번째 슬라이드 컨테이너 — 입구.
 * - 버튼 클릭: POST /api/votes/[id] 1회 → 게시글 이동 (결과는 게시글에서).
 * - 버튼 외 영역/CTA 클릭: 투표 없이 게시글 이동 (VoteHeroSlideView 배경 Link).
 * - 이미 투표(myChoice)면 버튼 숨기고 참여 상태만. status/myChoice만 클라 갱신, 집계는 안 쓴다.
 */
export default function VoteHeroSlide({
  vote: initial,
}: {
  vote: VoteHeroData
  /** HeroSliderClient 호환용 — 즉시 이동 구조에서는 미사용 */
  onVoted?: () => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>(initial.status)
  const [myChoice, setMyChoice] = useState<'A' | 'B' | null>(null)
  const [pending, setPending] = useState(false)
  const [activeChoice, setActiveChoice] = useState<'A' | 'B' | null>(null)
  const mounted = useRef(true)
  const postUrl = `/events/${initial.id}` // 공식 이벤트 상세(히든 목적지) — 사는이야기 게시글 아님

  const refresh = useCallback(async () => {
    try {
      // public(캐시) status + 사용자별 myChoice(no-store) 병렬 조회 — HERO는 결과 집계는 쓰지 않는다
      const [pubRes, mineRes] = await Promise.all([
        fetch('/api/votes/today', { credentials: 'same-origin' }),
        fetch('/api/votes/today/mine', { credentials: 'same-origin', cache: 'no-store' }),
      ])
      if (mounted.current && pubRes.ok) {
        const data = (await pubRes.json()) as { vote: VoteStatus | null }
        if (data.vote && data.vote.id === initial.id) setStatus(data.vote.status)
      }
      if (mounted.current && mineRes.ok) {
        const mine = (await mineRes.json()) as { myChoice: 'A' | 'B' | null }
        setMyChoice(mine.myChoice)
      }
    } catch {
      /* 서버 초기 status 유지 */
    }
  }, [initial.id])

  useEffect(() => {
    mounted.current = true
    // 선택/영역 클릭 시 즉시 이동 대비 프리페치 (공식 이벤트 상세 /events/[id])
    router.prefetch(postUrl)
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [refresh, router, postUrl])

  const cast = async (choice: 'A' | 'B') => {
    if (pending) return
    setActiveChoice(choice)
    setPending(true)
    try {
      const res = await fetch(`/api/votes/${initial.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ choice }),
      })
      if (res.ok) {
        // 응답 파싱을 기다리지 않고 이미 아는 postUrl로 즉시 이동 (결과는 게시글에서)
        router.push(postUrl)
      } else {
        // 409(마감/중복)·기타 실패 시 이동하지 않음
        setPending(false)
        setActiveChoice(null)
      }
    } catch {
      setPending(false)
      setActiveChoice(null)
    }
  }

  return (
    <VoteHeroSlideView
      question={initial.question}
      optionA={initial.optionA}
      optionB={initial.optionB}
      status={status}
      postUrl={postUrl}
      myChoice={myChoice}
      activeChoice={activeChoice}
      pending={pending}
      onCast={(c) => void cast(c)}
    />
  )
}
