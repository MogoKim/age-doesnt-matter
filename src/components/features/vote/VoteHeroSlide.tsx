'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { optionLabel } from './option-label'
import type { VoteStatus } from './VoteWidget'

/** HERO 슬라이드용 서버 초기 데이터 — 입구 렌더에 필요한 정적 정보만 (집계·myChoice 없음) */
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
  activeChoice?: 'A' | 'B' | null
  pending?: boolean
  onCast: (choice: 'A' | 'B') => void
}

/**
 * HERO 3번째 슬라이드 콘텐츠 (순수 프레젠테이션) — "투표 입구".
 * OPEN: 질문 + 흰 버튼 2개 (참여자 수·결과 막대 없음). 선택 시 컨테이너가 POST→게시글 이동.
 * CLOSED: 딥네이비 "오늘의 결과" teaser — 결과 막대 없이 "결과 보러 가기" 링크만.
 */
export function VoteHeroSlideView({
  question,
  optionA,
  optionB,
  status,
  postUrl,
  activeChoice = null,
  pending = false,
  onCast,
}: VoteHeroSlideViewProps) {
  const closed = status === 'CLOSED'

  if (closed) {
    return (
      <div
        className="absolute inset-0 flex flex-col justify-between px-5 py-3.5 lg:px-16 lg:py-7 text-white"
        style={{ background: 'linear-gradient(135deg, #23303F 0%, #3A4A5C 100%)' }}
      >
        <span className="text-[14px] lg:text-[16px] font-bold tracking-[0.3px] opacity-95">오늘의 결과</span>
        <h2
          className="m-0 font-bold leading-[1.3] break-keep"
          style={{ fontSize: 'clamp(18px, 5vw, 26px)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
        >
          {question}
        </h2>
        <Link
          href={postUrl}
          className="self-end text-[14px] lg:text-[15px] font-semibold text-white underline underline-offset-2 opacity-95"
        >
          결과 보러 가기 →
        </Link>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 flex flex-col justify-between px-5 py-3.5 lg:px-16 lg:py-7 text-white"
      style={{ background: 'linear-gradient(135deg, #FF6F61 0%, #FF8E7A 100%)' }}
    >
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
      <div className="flex gap-2 lg:gap-3 lg:max-w-[560px]">
        <HeroChoice label={optionLabel(optionA)} active={activeChoice === 'A'} disabled={pending} onClick={() => onCast('A')} />
        <HeroChoice label={optionLabel(optionB)} active={activeChoice === 'B'} disabled={pending} onClick={() => onCast('B')} />
      </div>
    </div>
  )
}

/**
 * HERO 3번째 슬라이드 컨테이너 — 입구. 선택 시 POST 1회 → 게시글 이동 (결과는 게시글에서).
 * status만 클라 갱신(OPEN→CLOSED 전환 대응). 집계·myChoice는 쓰지 않는다.
 * ⚠️ OPEN 중 투표 후 결과를 HERO에서 보여주지 않는다 — 누르는 즉시 이동.
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
  const [pending, setPending] = useState(false)
  const [activeChoice, setActiveChoice] = useState<'A' | 'B' | null>(null)
  const mounted = useRef(true)
  const postUrl = initial.linkedPostUrl ?? '/community/stories'

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/votes/today', { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as { vote: VoteStatus | null }
      if (mounted.current && data.vote && data.vote.id === initial.id) setStatus(data.vote.status)
    } catch {
      /* 서버 초기 status 유지 */
    }
  }, [initial.id])

  useEffect(() => {
    mounted.current = true
    // 선택 시 즉시 이동 대비 프리페치 (연동 게시글 있을 때만)
    if (initial.linkedPostUrl) router.prefetch(postUrl)
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [refresh, router, postUrl, initial.linkedPostUrl])

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
      activeChoice={activeChoice}
      pending={pending}
      onCast={(c) => void cast(c)}
    />
  )
}
