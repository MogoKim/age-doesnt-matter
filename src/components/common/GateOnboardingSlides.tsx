'use client'

import Image from 'next/image'
import { useState, useEffect, useRef, useCallback } from 'react'

// 머니워크식 슬라이드 온보딩 — TWA 진입 게이트 C(hard) 전용 화면.
//  - 가입 가치 3장(메인 카피는 이미지 안에 박혀 있음 / 화면엔 서브 카피만)
//  - 스와이프·자동전환(5초, prefers-reduced-motion 시 끔)·점 탭
//  - 카카오 OAuth(onSignup) / 게스트 진입(onEscape)은 상위 TwaEntryGate 로직 그대로 연결(변경 금지)

interface Slide {
  img: string
  sub: string
  placeholder: string // 이미지 로딩 전 배경 톤 (이미지가 덮음)
}

const SLIDES: Slide[] = [
  { img: '/images/onboarding/slide1.png', sub: '같은 나이, 같은 마음.\n또래에게 털어놓으면 한결 가벼워져요.', placeholder: '#FFF1EF' },
  { img: '/images/onboarding/slide2.png', sub: '글 하나 올리면 또래의\n진심 어린 댓글과 관심이 달려요.', placeholder: '#EEF6EE' },
  { img: '/images/onboarding/slide3.png', sub: '갱년기·가족이야기·2막준비,\n검색엔 없는 경험담을 매일 만나요.', placeholder: '#FFF8E1' },
]

const AUTO_MS = 5000
const SWIPE_THRESHOLD = 40

interface Props {
  onSignup: () => void
  onEscape: () => void
  starting: boolean
}

export default function GateOnboardingSlides({ onSignup, onEscape, starting }: Props) {
  const [index, setIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const startX = useRef<number | null>(null)

  // prefers-reduced-motion: reduce → 자동재생/전환 애니메이션 끔
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 자동 전환 — index 변경(스와이프·탭)마다 타이머 리셋. reduce-motion이면 비활성
  useEffect(() => {
    if (reduceMotion) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), AUTO_MS)
    return () => clearTimeout(t)
  }, [index, reduceMotion])

  const goTo = useCallback((i: number) => {
    setIndex(((i % SLIDES.length) + SLIDES.length) % SLIDES.length)
  }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (dx <= -SWIPE_THRESHOLD) goTo(index + 1)
    else if (dx >= SWIPE_THRESHOLD) goTo(index - 1)
    startX.current = null
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-background sm:min-h-0 sm:max-w-[420px] sm:rounded-2xl">
      {/* 1. 상단 로고 (심볼+워드마크 일체형) */}
      <div className="flex shrink-0 justify-center px-6 pt-[max(18px,env(safe-area-inset-top))] pb-1">
        <Image src="/logo.png" width={76} height={76} alt="우리나이가어때서" className="object-contain" priority />
      </div>

      {/* 2. 이미지 캐러셀(남은 공간 차지) + 서브카피(하단 고정 — 겹침 구조적 차단) */}
      <div className="flex min-h-0 flex-1 flex-col px-6 py-2">
        <div
          className="flex min-h-0 w-full flex-1 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex h-full w-full"
            style={{
              transform: `translateX(-${index * 100}%)`,
              transition: reduceMotion ? 'none' : 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {SLIDES.map((s, i) => (
              <div key={i} className="flex h-full w-full shrink-0 items-center justify-center">
                <div
                  className="relative aspect-[4/5] h-full max-w-full overflow-hidden rounded-[28px]"
                  style={{ backgroundColor: s.placeholder }}
                >
                  <Image
                    src={s.img}
                    alt=""
                    fill
                    sizes="(max-width:420px) 100vw, 420px"
                    className="object-cover"
                    priority={i === 0}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mx-auto max-w-[340px] shrink-0 whitespace-pre-line break-keep pt-4 text-center text-[19px] font-semibold leading-[1.5] text-foreground">
          {SLIDES[index].sub}
        </p>
      </div>

      {/* 3. 인디케이터 (현재 = 코랄 pill) */}
      <div className="flex shrink-0 items-center justify-center gap-2 pb-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}번째 슬라이드로 이동`}
            aria-current={i === index}
            onClick={() => goTo(i)}
            className="flex min-h-[36px] items-center px-1"
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
              }`}
            />
          </button>
        ))}
      </div>

      {/* 4. 하단 고정 CTA */}
      <div className="shrink-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onSignup}
          disabled={starting}
          aria-busy={starting}
          className="flex h-[60px] w-full items-center justify-center gap-2 rounded-xl font-bold transition-all hover:brightness-95 disabled:opacity-70"
          style={{ background: '#FEE500', color: '#191600', boxShadow: '0 2px 8px rgba(254,229,0,0.35)' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 2C5.582 2 2 4.925 2 8.5c0 2.26 1.37 4.25 3.46 5.43l-.9 3.3a.25.25 0 0 0 .38.27L8.8 15.5c.39.05.79.08 1.2.08 4.418 0 8-2.925 8-6.5S14.418 2 10 2Z"
              fill="currentColor"
            />
          </svg>
          {starting ? '카카오로 이동 중...' : '카카오로 3초 만에 시작하기'}
        </button>
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={onEscape}
            className="min-h-[44px] text-[15px] text-muted-foreground underline underline-offset-2"
          >
            먼저 둘러볼게요
          </button>
        </div>
      </div>
    </div>
  )
}
