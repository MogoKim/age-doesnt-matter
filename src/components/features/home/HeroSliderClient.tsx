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
    <section className="w-full h-[220px] lg:h-[420px] relative overflow-hidden bg-primary/10">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-500',
            index === current && 'opacity-100'
          )}
        >
          <Link
            href={slide.ctaHref}
            className="absolute inset-0 block"
            aria-label={`배너 ${index + 1}`}
            tabIndex={index === current ? 0 : -1}
          >
            {slide.imageUrl ? (
              <Image
                src={slide.imageUrl}
                alt={`배너 ${index + 1}`}
                fill
                className="object-cover"
                sizes="100vw"
                priority={index === 0}
                loading={index === 0 ? undefined : 'lazy'}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={slide.bgColor ? { background: slide.bgColor } : undefined}
              />
            )}
          </Link>
        </div>
      ))}
      {slides.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              className={cn(
                'p-3 border-none bg-transparent cursor-pointer',
              )}
              onClick={() => goTo(index)}
              aria-label={`슬라이드 ${index + 1}`}
            >
              <span className={cn(
                'block h-2 rounded-full bg-white/50 transition-all duration-300',
                index === current ? 'w-6 bg-white' : 'w-2.5'
              )} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
