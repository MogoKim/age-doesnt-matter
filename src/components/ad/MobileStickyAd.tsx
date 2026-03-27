'use client'

import { useState, useEffect } from 'react'
import AdSenseUnit from './AdSenseUnit'

/**
 * 모바일 하단 스티키 광고
 * - 스크롤 300px 이상 시 등장
 * - 닫기 버튼으로 세션 내 숨김
 * - 데스크탑에서는 숨김 (lg 이상)
 */
export default function MobileStickyAd() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (dismissed) return

    const onScroll = () => {
      setVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [dismissed])

  if (dismissed || !visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div className="relative bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.08)] px-3 py-2">
        <button
          onClick={() => setDismissed(true)}
          className="absolute -top-8 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-white border border-border shadow-sm text-muted-foreground text-sm"
          aria-label="광고 닫기"
        >
          ✕
        </button>
        <AdSenseUnit slotId="auto" format="horizontal" responsive className="min-h-[50px]" />
      </div>
    </div>
  )
}
