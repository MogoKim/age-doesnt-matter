'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import AdSenseUnit from './AdSenseUnit'
import { ADSENSE } from './ad-slots'

/**
 * 모바일 하단 스티키 광고
 * - 스크롤 300px 이상 시 등장
 * - 닫기 버튼으로 세션 내 숨김
 * - 데스크탑에서는 숨김 (lg 이상)
 * - 게시글 상세 페이지에서는 숨김 (댓글 입력창과 겹침 방지)
 */
export default function MobileStickyAd() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const pathname = usePathname()

  // 게시글 상세 페이지에서는 댓글 입력창과 겹치므로 숨김
  const isPostDetail = /^\/community\/[^/]+\/[^/]+$/.test(pathname)

  useEffect(() => {
    if (dismissed || isPostDetail) return

    const onScroll = () => {
      setVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [dismissed, isPostDetail])

  if (dismissed || !visible || isPostDetail) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden pb-[env(safe-area-inset-bottom,0px)]">
      <div className="relative bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.08)] px-3 py-2">
        <button
          onClick={() => setDismissed(true)}
          className="absolute -top-14 right-2 w-[52px] h-[52px] flex items-center justify-center rounded-full bg-white border border-border shadow-sm text-muted-foreground text-body"
          aria-label="광고 닫기"
        >
          ✕
        </button>
        <AdSenseUnit slotId={ADSENSE.HOME_SECTION} format="horizontal" responsive className="min-h-[50px]" />
      </div>
    </div>
  )
}
