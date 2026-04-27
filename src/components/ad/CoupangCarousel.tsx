'use client'

import { useEffect, useRef } from 'react'
import { COUPANG } from './ad-slots'

interface Props {
  className?: string
}

/**
 * 쿠팡 캐러셀 배너 (PartnersCoupang.G, 320x100)
 * script 태그를 컨테이너에 직접 주입 — document.currentScript.parentNode 기반 삽입
 */
export default function CoupangCarousel({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || !containerRef.current) return
    initialized.current = true

    const { id, width, height } = COUPANG.DYNAMIC_MOBILE
    const trackingCode = COUPANG.TRACKING_CODE

    const init = () => {
      const initScript = document.createElement('script')
      initScript.text = `new PartnersCoupang.G({"id":${id},"template":"carousel","trackingCode":${JSON.stringify(trackingCode)},"width":${JSON.stringify(width)},"height":${JSON.stringify(height)},"tsource":""});`
      containerRef.current?.appendChild(initScript)
    }

    // g.js 중복 로드 방지
    if ((window as unknown as Record<string, unknown>)['PartnersCoupang']) {
      init()
    } else {
      const script = document.createElement('script')
      script.src = 'https://ads-partners.coupang.com/g.js'
      script.async = true
      script.onload = init
      containerRef.current?.appendChild(script)
    }
  }, [])

  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div ref={containerRef} className="flex justify-center min-h-[100px]" />
      <p className="text-center text-[11px] text-muted-foreground mt-1">
        이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
