'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import VoteHeroSlide, { type VoteHeroData } from '@/components/features/vote/VoteHeroSlide'
import SurveyHeroSlide, { type SurveyHeroData } from '@/components/features/event/SurveyHeroSlide'

export interface SlideData {
  id: string
  title: string
  subtitle?: string
  themeColor: string
  themeColorMid?: string
  themeColorEnd?: string
  ctaText?: string
  ctaUrl: string
  imageUrl?: string
  /** 오늘의 투표 슬라이드 — 있으면 일반 렌더 대신 VoteHeroSlide (직접투표) */
  vote?: VoteHeroData
  /** 1분 의견함(SURVEY) 슬라이드 — 있으면 일반 렌더 대신 SurveyHeroSlide (입구 전용) */
  survey?: SurveyHeroData
}

const AUTO_PLAY_INTERVAL = 7000

/** 3색 그라디언트 배경 CSS 문자열 생성 */
function buildGradient(slide: SlideData): string {
  const from = slide.themeColor
  const mid = slide.themeColorMid ?? slide.themeColor
  const to = slide.themeColorEnd ?? slide.themeColorMid ?? slide.themeColor
  return `linear-gradient(135deg, ${from} 0%, ${mid} 50%, ${to} 100%)`
}

interface Props {
  slides: SlideData[]
}

export default function HeroSliderClient({ slides }: Props) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  // 투표 슬라이드에서 투표하면 자동재생 정지 — 결과를 읽기 전에 슬라이드가 넘어가지 않도록
  const [voteLock, setVoteLock] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length)
  }, [slides.length])

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev + 1) % slides.length)
  }, [slides.length])

  // 자동재생 — 호버/포커스/투표 직후 일시정지
  useEffect(() => {
    if (slides.length <= 1 || paused || voteLock) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length)
    }, AUTO_PLAY_INTERVAL)
    return () => clearInterval(timer)
  }, [slides.length, paused, voteLock])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext(); else goPrev()
    }
    touchStartX.current = null
  }, [goNext, goPrev])

  if (slides.length === 0) return null

  return (
    <section
      className="w-full relative overflow-hidden [aspect-ratio:5/2] lg:[aspect-ratio:8/3]"
      style={{ minHeight: 200 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label="홈 배너 슬라이더"
      aria-roledescription="carousel"
    >
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`슬라이드 ${index + 1} / ${slides.length}`}
          aria-hidden={index !== current}
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            index === current ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          style={{ background: slide.imageUrl || slide.vote ? undefined : buildGradient(slide) }}
        >
          {/* 오늘의 투표 슬라이드 — 일반 렌더 대신 직접투표 미니 투표판 */}
          {slide.vote ? (
            <VoteHeroSlide vote={slide.vote} onVoted={() => setVoteLock(true)} />
          ) : slide.survey ? (
            /* 1분 의견함 — 일반 배너 대신 입구 전용 렌더러(라벨+짧은 제목+CTA) */
            <SurveyHeroSlide data={slide.survey} active={index === current} />
          ) : (
            <>
          {/* 이미지 배경 */}
          {slide.imageUrl && (
            <Image
              src={slide.imageUrl}
              alt={slide.title}
              fill
              className="object-cover object-center"
              priority={index === 0}
              sizes="(min-width: 1200px) 1200px, 100vw"
            />
          )}

          {/* 오버레이 — 이미지 있으면 좌측 어두운 그라디언트, 없으면 반투명 어둠 */}
          <div
            className="absolute inset-0"
            style={{
              background: slide.imageUrl
                ? 'linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.08) 100%)'
                : 'rgba(0,0,0,0.15)',
            }}
          />

          {/* 텍스트 오버레이 — 전체 영역 클릭 시 ctaUrl로 이동 */}
          <Link
            href={(slide.ctaUrl ?? '/').trim() || '/'}
            className={cn(
              'absolute inset-0 flex flex-col justify-end gap-2.5 px-5 pb-7 lg:justify-center lg:gap-3 lg:px-16 lg:pb-0 no-underline [-webkit-tap-highlight-color:transparent]',
              slide.imageUrl ? 'items-start text-left' : 'items-center text-center'
            )}
            tabIndex={index === current ? 0 : -1}
          >
            <h2
              className="text-white font-bold leading-[1.4] break-keep max-w-[72%] lg:max-w-none"
              style={{ fontSize: 'clamp(22px, 6vw, 32px)', whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            >
              {slide.title.replace(/\\n/g, '\n')}
            </h2>

            {slide.subtitle && (
              <p
                className="text-white/90 leading-snug break-keep max-w-[72%] lg:max-w-none"
                style={{ fontSize: 'clamp(17px, 4vw, 20px)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
              >
                {slide.subtitle}
              </p>
            )}

            {slide.ctaText && (
              <span
                className="mt-1 inline-flex items-center justify-center px-4 h-11 rounded-full bg-black/30 backdrop-blur-sm text-white font-semibold"
                style={{ fontSize: 'clamp(16px, 3.8vw, 17px)' }}
              >
                {slide.ctaText}
              </span>
            )}
          </Link>
            </>
          )}
        </div>
      ))}

      {/* 우하단 카운터 pill — 비인터랙티브 */}
      {slides.length > 1 && (
        <div
          className="absolute right-3 bottom-3 z-10 rounded-full bg-black/35 px-3 h-8 inline-flex items-center justify-center text-[13px] font-semibold leading-none tabular-nums text-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
          aria-live="polite"
          aria-label={`현재 슬라이드 ${current + 1} / ${slides.length}`}
        >
          {current + 1} / {slides.length}
        </div>
      )}
    </section>
  )
}
