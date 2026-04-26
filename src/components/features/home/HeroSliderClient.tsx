'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
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
}

const AUTO_PLAY_INTERVAL = 5000

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

  const goTo = useCallback((index: number) => setCurrent(index), [])

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
    <div className="w-full">
      <section
        className="w-full relative overflow-hidden"
        style={{ aspectRatio: '8/3', minHeight: 160 }}
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
            style={{ background: buildGradient(slide) }}
          >
            {/* 텍스트 오버레이 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
              <h2
                className="text-white font-bold leading-[1.35] break-keep"
                style={{ fontSize: 'clamp(20px, 5vw, 32px)', whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.18)' }}
              >
                {slide.title}
              </h2>

              {slide.subtitle && (
                <p
                  className="text-white/85 leading-snug break-keep"
                  style={{ fontSize: 'clamp(14px, 3vw, 18px)', textShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                >
                  {slide.subtitle}
                </p>
              )}

              {slide.ctaText && (
                <Link
                  href={slide.ctaUrl}
                  className="mt-1 inline-flex items-center justify-center px-5 h-[44px] rounded-full bg-white/20 backdrop-blur-sm text-white font-semibold no-underline hover:bg-white/30 transition-colors active:scale-95"
                  style={{ fontSize: 'clamp(13px, 3vw, 16px)', minWidth: 100 }}
                  tabIndex={index === current ? 0 : -1}
                >
                  {slide.ctaText}
                </Link>
              )}
            </div>
          </div>
        ))}

        {/* 좌우 화살표 (데스크탑) */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/35 transition-colors z-10"
              aria-label="이전 슬라이드"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNext}
              className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/35 transition-colors z-10"
              aria-label="다음 슬라이드"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </section>

      {/* 인디케이터 dots */}
      {slides.length > 1 && (
        <div
          className="flex justify-center items-center gap-1.5 py-2 bg-background"
          role="tablist"
          aria-label="슬라이드 선택"
        >
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === current}
              aria-label={`슬라이드 ${index + 1}`}
              onClick={() => goTo(index)}
              className="p-1.5 border-none bg-transparent cursor-pointer"
            >
              <span
                className={cn(
                  'block rounded-full transition-all duration-300',
                  index === current
                    ? 'w-5 h-2 bg-primary'
                    : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
