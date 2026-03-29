'use client'

import { useEffect, useRef } from 'react'
import { COUPANG } from './ad-slots'

interface CoupangBannerProps {
  /** 배너 프리셋: mobile(320x100) / desktop(300x250) / product(320x250) */
  preset: 'mobile' | 'desktop' | 'product'
  className?: string
}

const PRESET_MAP = {
  mobile: COUPANG.DYNAMIC_MOBILE,
  desktop: COUPANG.DYNAMIC_DESKTOP,
  product: COUPANG.PRODUCT_CAROUSEL,
} as const

/**
 * 쿠팡 파트너스 다이나믹 배너
 * script 동적 로드 → PartnersCoupang.G() 호출
 */
export default function CoupangBanner({ preset, className }: CoupangBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || !containerRef.current) return
    loaded.current = true

    const config = PRESET_MAP[preset]
    const container = containerRef.current

    // g.js 로드
    const script = document.createElement('script')
    script.src = 'https://ads-partners.coupang.com/g.js'
    script.async = true
    script.onload = () => {
      const initScript = document.createElement('script')
      initScript.textContent = `new PartnersCoupang.G(${JSON.stringify({
        id: config.id,
        template: 'carousel',
        trackingCode: COUPANG.TRACKING_CODE,
        width: String(config.width),
        height: String(config.height),
        tsource: '',
      })});`
      container.appendChild(initScript)
    }
    container.appendChild(script)
  }, [preset])

  return (
    <aside
      className={`relative ${className ?? ''}`}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div ref={containerRef} className="flex justify-center" />
    </aside>
  )
}
