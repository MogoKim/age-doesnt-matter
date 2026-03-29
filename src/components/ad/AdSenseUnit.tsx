'use client'

import { useEffect, useRef, useState } from 'react'

interface AdSenseUnitProps {
  /** AdSense 광고 슬롯 ID (예: "1234567890") */
  slotId: string
  /** 광고 포맷 */
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical'
  /** 반응형 여부 */
  responsive?: boolean
  className?: string
}

/**
 * Google AdSense 디스플레이 광고 유닛
 * 게시글 하단, 목록 인라인 등에 사용
 * 3초 후 광고 높이가 0이면 자동 숨김
 */
export default function AdSenseUnit({
  slotId,
  format = 'auto',
  responsive = true,
  className,
}: AdSenseUnitProps) {
  const adRef = useRef<HTMLModElement>(null)
  const pushed = useRef(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (pushed.current) return
    try {
      const adsbygoogle = (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ?? []
      adsbygoogle.push({})
      pushed.current = true
    } catch {
      // AdSense 스크립트 미로드 시 무시
    }

    // 3초 후 광고 로드 실패 감지 — 높이 0이면 숨김
    const timer = setTimeout(() => {
      if (adRef.current && adRef.current.offsetHeight === 0) {
        setHidden(true)
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  if (hidden) return null

  return (
    <aside
      className={`relative ${className ?? ''}`}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-4937127825992215"
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </aside>
  )
}
