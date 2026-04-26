'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const SESSION_KEY = 'top-promo-dismissed'

interface TopPromoBannerClientProps {
  tag:  string
  text: string
  href: string
}

export default function TopPromoBannerClient({
  tag,
  text,
  href,
}: TopPromoBannerClientProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 이번 탭 세션에서 닫은 경우 숨김
    const dismissed = sessionStorage.getItem(SESSION_KEY)
    if (!dismissed) setVisible(true)
  }, [])

  if (!visible) return null

  function handleDismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(false)
  }

  return (
    <div
      className="relative flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-center"
      style={{
        background: 'linear-gradient(90deg, var(--hero-1-from) 0%, var(--hero-1-mid) 50%, var(--hero-1-to) 100%)',
      }}
      role="banner"
      aria-label="프로모션 배너"
    >
      {/* 태그 칩 */}
      {tag && (
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-white/20 text-white text-[12px] font-semibold leading-none whitespace-nowrap">
          {tag}
        </span>
      )}

      {/* 텍스트 + 링크 */}
      <Link
        href={href}
        className="text-white text-[15px] font-medium leading-snug no-underline hover:underline line-clamp-1 flex-1 min-w-0"
      >
        {text}
      </Link>

      {/* 닫기 버튼 */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 flex items-center justify-center w-[32px] h-[32px] rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors [-webkit-tap-highlight-color:transparent]"
        aria-label="배너 닫기"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
