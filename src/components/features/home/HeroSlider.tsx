'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

import styles from './HomePage.module.css'

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
    bgColor: '#FF6F61',
  },
  {
    id: '2',
    title: '같은 세대의\n따뜻한 이야기',
    ctaText: '커뮤니티 가기',
    ctaHref: '/community/stories',
    bgColor: '#5B8DEF',
  },
  {
    id: '3',
    title: '건강하고 활기찬\n시니어 라이프',
    ctaText: '매거진 읽기',
    ctaHref: '/magazine',
    bgColor: '#4CAF50',
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
    <section className={styles.heroSlider}>
      {SLIDES.map((slide, index) => (
        <div
          key={slide.id}
          className={`${styles.heroSlide} ${index === current ? styles.heroSlideActive : ''}`}
          style={{ background: slide.bgColor }}
        >
          <div className={styles.heroOverlay}>
            <h2 className={styles.heroTitle}>{slide.title}</h2>
            <Link href={slide.ctaHref} className={styles.heroCta}>
              {slide.ctaText} →
            </Link>
          </div>
        </div>
      ))}
      <div className={styles.heroDots}>
        {SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            className={`${styles.heroDot} ${index === current ? styles.heroDotActive : ''}`}
            onClick={() => goTo(index)}
            aria-label={`슬라이드 ${index + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
