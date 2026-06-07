'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'

interface LazyAdProps {
  children: ReactNode
  /** placeholder 높이(px). 광고 실제 높이와 동일하게 잡아 CLS 0 유지 */
  minHeight: number
  className?: string
  /** viewport 도달 전 미리 로드할 거리 (수익 영향 최소화) */
  rootMargin?: string
}

/**
 * IntersectionObserver 기반 광고 지연 마운트 래퍼.
 * viewport 근접(rootMargin) 시에만 children을 마운트해 초기 로드 시
 * 외부 iframe/스크립트 네트워크 요청을 막는다.
 *
 * - placeholder는 visible 이후에도 minHeight를 유지 → 레이아웃 시프트(CLS) 0
 * - rootMargin 기본 400px 선행 로드로 스크롤 도달 전 광고가 채워져 viewability 손실 최소
 * - IO 미지원 환경은 즉시 마운트 (graceful degradation)
 */
export default function LazyAd({
  children,
  minHeight,
  className,
  rootMargin = '400px',
}: LazyAdProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible, rootMargin])

  return (
    <div ref={ref} className={className} style={{ minHeight }}>
      {visible ? children : null}
    </div>
  )
}
