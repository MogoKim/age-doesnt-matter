'use client'

import { useEffect, useRef } from 'react'
import { ADSENSE } from './ad-slots'

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

/**
 * Google AdSense 광고 유닛
 * - display: 섹션사이, 사이드바
 * - in-feed: 피드 목록 사이
 * - in-article: 글 본문 영역
 * 3초 후 광고 높이가 0이면 자동 숨김
 */
export default function AdSenseUnit({
  slotId,
  format = 'auto',
  responsive = true,
  layout,
  layoutKey,
  className,
}: AdSenseUnitProps) {
  const adRef = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current) return
    try {
      const adsbygoogle = (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ?? []
      adsbygoogle.push({})
      pushed.current = true
    } catch {
      // AdSense 스크립트 미로드 시 무시
    }
  }, [])

  // 인아티클 스타일: 중앙 정렬
  const style: React.CSSProperties = layout === 'in-article'
    ? { display: 'block', textAlign: 'center' as const }
    : { display: 'block' }

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
        style={style}
        data-ad-client={ADSENSE.CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format={format}
        {...(responsive && !layout && !layoutKey ? { 'data-full-width-responsive': 'true' } : {})}
        {...(layout ? { 'data-ad-layout': layout } : {})}
        {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
      />
    </aside>
  )
}
