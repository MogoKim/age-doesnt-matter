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

interface PartnersCoupangGlobal {
  G: new (config: Record<string, unknown>) => void
}

/**
 * 쿠팡 파트너스 다이나믹 배너
 * g.js는 layout.tsx에서 글로벌 1회 로드 → 여기서는 PartnersCoupang.G()만 호출
 * cleanup으로 언마운트 시 innerHTML 초��화
 */
export default function CoupangBanner({ preset, className }: CoupangBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const config = PRESET_MAP[preset]

    const tryInit = (): boolean => {
      const PC = (window as unknown as { PartnersCoupang?: PartnersCoupangGlobal }).PartnersCoupang
      if (!PC) return false

      // PartnersCoupang.G는 container 내부에 직접 렌더링하므로 script 생성 필요
      const initScript = document.createElement('script')
      initScript.textContent = `new PartnersCoupang.G(${JSON.stringify({
        id: config.id,
        template: 'carousel',
        trackingCode: COUPANG.TRACKING_CODE,
        width: String(config.width),
        height: String(config.height),
        subId: null,
      })});`
      container.appendChild(initScript)
      return true
    }

    // g.js 로드 완료 대기 → 500ms 간격 재시도 (최대 6회 = 3초)
    if (!tryInit()) {
      let attempts = 0
      const interval = setInterval(() => {
        attempts++
        if (tryInit() || attempts >= 6) {
          clearInterval(interval)
        }
      }, 500)
      return () => clearInterval(interval)
    }

    return () => {
      container.innerHTML = ''
    }
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
