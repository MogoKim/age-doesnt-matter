'use client'

import { useState, useEffect } from 'react'
import AdSenseUnit from './AdSenseUnit'
import { ADSENSE } from './ad-slots'

const SESSION_KEY = 'sticky-ad-dismissed'

/**
 * StickyBottomAd — 스크롤 50% 이상 시 하단 sticky 광고 노출
 * - 세션 닫기: sessionStorage 저장 (새 탭에서는 다시 노출)
 * - 모바일 전용 (데스크탑 lg: 숨김)
 */
export default function StickyBottomAd() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 이미 닫은 세션이면 표시 안 함
    if (sessionStorage.getItem(SESSION_KEY)) return

    function handleScroll() {
      const scrolled = window.scrollY + window.innerHeight
      const total = document.documentElement.scrollHeight
      if (total > 0 && scrolled / total >= 0.5) {
        setVisible(true)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function handleDismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[90] lg:hidden"
      role="complementary"
      aria-label="하단 광고"
    >
      {/* 닫기 버튼 */}
      <div className="relative bg-card border-t border-border">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute -top-8 right-3 flex items-center justify-center w-8 h-8 rounded-t-lg bg-card border border-b-0 border-border text-muted-foreground hover:text-foreground"
          aria-label="광고 닫기"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>

        {/* 광고 라벨 */}
        <p className="text-[11px] text-muted-foreground text-center pt-1 pb-0 m-0 leading-none">광고</p>

        {/* AdSense 슬롯 */}
        <div className="flex items-center justify-center min-h-[50px] px-2 pb-2">
          <AdSenseUnit
            slotId={ADSENSE.STICKY_BOTTOM}
            format="horizontal"
            className="w-full max-w-[320px]"
          />
        </div>
      </div>
    </div>
  )
}
