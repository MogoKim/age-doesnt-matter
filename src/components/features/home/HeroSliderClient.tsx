'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

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
  const touchStartX = useRef<number | null>(null)

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length)
  }, [slides.length])

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev + 1) % slides.length)
  }, [slides.length])

  // 자동재생 — 호버/포커스 시 일시정지
  useEffect(() => {
    if (slides.length <= 1 || paused) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length)
    }, AUTO_PLAY_INTERVAL)
    return () => clearInterval(timer)
  }, [slides.length, paused])

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
          style={{ background: slide.imageUrl ? undefined : buildGradient(slide) }}
        >
          {/* 이미지 배경 */}
          {slide.imageUrl && (
            <Image
              src={slide.imageUrl}
              alt={slide.title}
              fill
              className="object-cover object-center"
              priority={index === 0}
              sizes="100vw"
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
            href={slide.ctaUrl ?? '/'}
            className={cn(
              'absolute inset-0 flex flex-col justify-center gap-3 px-5 lg:px-16 no-underline [-webkit-tap-highlight-color:transparent]',
              slide.imageUrl ? 'items-start text-left' : 'items-center text-center'
            )}
            tabIndex={index === current ? 0 : -1}
            aria-label={slide.title.replace(/\\n/g, ' ')}
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
                className="mt-1 inline-flex items-center justify-center px-5 h-[52px] rounded-full bg-white/20 backdrop-blur-sm text-white font-semibold"
                style={{ fontSize: 'clamp(17px, 4vw, 19px)', minWidth: 130 }}
              >
                {slide.ctaText}
              </span>
            )}
          </Link>
        </div>
      ))}

      {/* 우하단 이전/카운터/다음 pill 인디케이터 */}
      {slides.length > 1 && (
        <div className="absolute right-3 bottom-3 z-10 flex items-center overflow-hidden rounded-full bg-black/35 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
          <button
            type="button"
            onClick={goPrev}
            className="w-11 h-11 inline-flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15"
            aria-label="이전 슬라이드"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span
            className="min-w-[48px] text-center text-[16px] font-semibold leading-none tabular-nums text-white"
            aria-live="polite"
          >
            {current + 1} / {slides.length}
          </span>
          <button
            type="button"
            onClick={goNext}
            className="w-11 h-11 inline-flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15"
            aria-label="다음 슬라이드"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </section>
  )
}
