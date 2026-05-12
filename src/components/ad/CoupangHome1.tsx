'use client'

import { useEffect, useRef } from 'react'
import { COUPANG } from './ad-slots'

interface Props {
  className?: string
}

export default function CoupangHome1({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initialized.current) return
    initialized.current = true

    const { id, width, height } = COUPANG.HOME1_CAROUSEL

    const init = () => {
      const initScript = document.createElement('script')
      initScript.text = `new PartnersCoupang.G({"id":${id},"template":"carousel","trackingCode":"AF3181348","width":"${width}","height":"${height}","tsource":""})`
      // container div 바로 다음 형제로 삽입 — PartnersCoupang.G가 앞 형제 div를 렌더링 타겟으로 인식
      container.insertAdjacentElement('afterend', initScript)
    }

    if ((window as unknown as Record<string, unknown>)['PartnersCoupang']) {
      init()
    } else {
      const gScript = document.createElement('script')
      gScript.src = 'https://ads-partners.coupang.com/g.js'
      gScript.async = true
      gScript.onload = init
      document.head.appendChild(gScript)
    }
  }, [])

  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-[10px] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div ref={containerRef} className="flex justify-center min-h-[150px]" />
      <p className="text-center text-[8px] text-muted-foreground mt-1">
        이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
