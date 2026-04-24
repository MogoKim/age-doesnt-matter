'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ADSENSE } from './ad-slots'
import CoupangBanner from './CoupangBanner'

interface AdSenseUnitProps {
  /** AdSense 광고 슬롯 ID */
  slotId: string
  /** 광고 포맷 */
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical' | 'fluid'
  /** 반응형 여부 */
  responsive?: boolean
  /** 인아티클 레이아웃 (글 본문용) */
  layout?: 'in-article'
  /** 인피드 레이아웃 키 (피드 사이용) */
  layoutKey?: string
  className?: string
}

declare global {
  interface Window {
    adsbygoogle: Record<string, unknown>[]
  }
}

/**
 * Google AdSense 광고 유닛 (v2 — 근본 재작성)
 *
 * 이전 버전 문제:
 * - pushed.current = true → 1회만 push, SPA 라우트 전환 시 광고 재로드 안 됨
 * - 스크립트 로드 전 push → race condition
 *
 * v2 변경:
 * - pathname 변경 시 ins 태그 재생성 + push 재호출
 * - data-ad-status 감시 → unfilled 시 쿠팡 폴백
 * - 스크립트 로드 상태 확인 후 push
 */
export default function AdSenseUnit({
  slotId,
  format = 'auto',
  responsive = true,
  layout,
  layoutKey,
  className,
}: AdSenseUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const [showFallback, setShowFallback] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 이전 ins 제거 (SPA 네비게이션 대응)
    container.innerHTML = ''
    setShowFallback(false)

    // 새 ins 태그 생성
    const ins = document.createElement('ins')
    ins.className = 'adsbygoogle'
    ins.setAttribute('data-ad-client', ADSENSE.CLIENT_ID)
    ins.setAttribute('data-ad-slot', slotId)
    ins.setAttribute('data-ad-format', format)

    if (layout === 'in-article') {
      ins.style.display = 'block'
      ins.style.textAlign = 'center'
      ins.setAttribute('data-ad-layout', 'in-article')
    } else {
      ins.style.display = 'block'
    }

    if (responsive && !layout && !layoutKey) {
      ins.setAttribute('data-full-width-responsive', 'true')
    }
    if (layoutKey) {
      ins.setAttribute('data-ad-layout-key', layoutKey)
    }

    container.appendChild(ins)

    // data-ad-status 감시 — unfilled 시 쿠팡 폴백
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-ad-status') {
          const status = (m.target as HTMLElement).getAttribute('data-ad-status')
          if (status === 'unfilled') {
            setShowFallback(true)
          }
        }
      }
    })
    observer.observe(ins, { attributes: true })

    // adsbygoogle.push() — 스크립트가 로드되지 않았으면 큐에 쌓임
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense 스크립트 미로드 시 무시
    }

    return () => {
      observer.disconnect()
    }
  }, [slotId, format, responsive, layout, layoutKey, pathname])

  return (
    <aside
      className={`relative ${className ?? ''}`}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div ref={containerRef} />
      {showFallback && (
        <CoupangBanner preset="mobile" className="mt-2" />
      )}
    </aside>
  )
}
