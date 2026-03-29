'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface HeroSlide {
  id: string
  title: string
  ctaText: string
  ctaHref: string
  bgColor: string
}

const SLIDES: HeroSlide[] = [
  {
    id: '1',
    title: '당신의\n두 번째 전성기',
    ctaText: '일자리 보기',
    ctaHref: '/jobs',
    bgColor: 'var(--hero-slide-1)',
  },
  {
    id: '2',
    title: '같은 세대의\n따뜻한 이야기',
    ctaText: '커뮤니티 가기',
    ctaHref: '/community/stories',
    bgColor: 'var(--hero-slide-2)',
  },
  {
    id: '3',
    title: '건강하고 활기찬\n매일을 함께',
    ctaText: '매거진 읽기',
    ctaHref: '/magazine',
    bgColor: 'var(--hero-slide-3)',
  },
]

const AUTO_PLAY_INTERVAL = 4000

export default function HeroSlider() {
  const [current, setCurrent] = useState(0)

  const goTo = useCallback((index: number) => {
    setCurrent(index)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length)
    }, AUTO_PLAY_INTERVAL)

    return () => clearInterval(timer)
  }, [])

  return (
    <section className="w-full h-[170px] lg:h-[420px] relative overflow-hidden bg-primary/10">
      {SLIDES.map((slide, index) => (
        <div
          key={slide.id}
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-500',
            index === current && 'opacity-100'
          )}
          style={{ background: slide.bgColor }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent p-4 flex flex-col justify-end lg:max-w-[1200px] lg:mx-auto lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-full lg:p-10">
            <h2 className="text-white text-[22px] lg:text-[40px] font-bold leading-[1.4] [text-shadow:0_2px_8px_rgba(0,0,0,0.4)] mb-3 lg:mb-5 break-keep whitespace-pre-line">
              {slide.title}
            </h2>
            <Link
              href={slide.ctaHref}
              className="inline-flex items-center gap-1.5 h-[52px] px-5 lg:px-7 bg-primary text-white rounded-lg text-body lg:text-title font-semibold no-underline self-start hover:bg-[#E85D50]"
            >
              {slide.ctaText} →
            </Link>
          </div>
        </div>
      ))}
      <div className="absolute bottom-3 right-4 flex gap-1.5">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            className={cn(
              'w-2 h-2 rounded-full bg-white/50 transition-all duration-300 border-none p-0 cursor-pointer',
              index === current && 'bg-white w-5 rounded'
            )}
            onClick={() => goTo(index)}
            aria-label={`슬라이드 ${index + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
