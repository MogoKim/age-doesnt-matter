'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

export interface SlideData {
  id: string
  title: string
  ctaText?: string
  ctaHref: string
  bgColor?: string
  imageUrl?: string
}

const AUTO_PLAY_INTERVAL = 4000

interface Props {
  slides: SlideData[]
}

export default function HeroSliderClient({ slides }: Props) {
  const [current, setCurrent] = useState(0)

  const goTo = useCallback((index: number) => {
    setCurrent(index)
  }, [])

  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length)
    }, AUTO_PLAY_INTERVAL)

    return () => clearInterval(timer)
  }, [slides.length])

  if (slides.length === 0) return null

  return (
    <section className="w-full h-[170px] lg:h-[420px] relative overflow-hidden bg-primary/10">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-500',
            index === current && 'opacity-100'
          )}
          style={slide.bgColor ? { background: slide.bgColor } : undefined}
        >
          {slide.imageUrl && (
            <Image
              src={slide.imageUrl}
              alt={slide.title}
              fill
              className="object-cover"
              sizes="100vw"
              priority={index === 0}
              loading={index === 0 ? undefined : 'lazy'}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent p-4 flex flex-col justify-end lg:max-w-[1200px] lg:mx-auto lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-full lg:p-10">
            <h2 className="text-white text-[22px] lg:text-[40px] font-bold leading-[1.4] [text-shadow:0_2px_8px_rgba(0,0,0,0.4)] mb-3 lg:mb-5 break-keep whitespace-pre-line">
              {slide.title}
            </h2>
            {slide.ctaText && (
              <Link
                href={slide.ctaHref}
                className="inline-flex items-center gap-1.5 h-[52px] px-5 lg:px-7 bg-primary text-white rounded-lg text-body lg:text-title font-semibold no-underline self-start hover:bg-[#E85D50]"
              >
                {slide.ctaText} →
              </Link>
            )}
          </div>
        </div>
      ))}
      {slides.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {slides.map((slide, index) => (
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
      )}
    </section>
  )
}
