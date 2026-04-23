'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from './AddToHomeScreen'

const BLOCKED_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'instagram-inapp', 'crios', 'desktop'] as const
const KEY_INSTALLED = 'pwa_installed'
const SESSION_INLINE_SHOWN = 'pwa_inline_shown'

export default function PwaInlineBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const env = detectEnv()
    if ((BLOCKED_ENVS as readonly string[]).includes(env)) return
    if (localStorage.getItem(KEY_INSTALLED) === '1') return
    if (sessionStorage.getItem(SESSION_INLINE_SHOWN)) return
    setShow(true)
  }, [])

  const handleInstall = () => {
    sessionStorage.setItem(SESSION_INLINE_SHOWN, '1')
    setShow(false)
    window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
  }

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_INLINE_SHOWN, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-symbol.png"
        alt="우나어"
        className="w-10 h-10 rounded-lg object-contain flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-foreground leading-tight">앱처럼 쓰는데 완전 무료</p>
        <p className="text-[13px] text-muted-foreground leading-tight mt-0.5">홈 화면에 추가하면 바로 열려요</p>
      </div>
      <button
        onClick={handleInstall}
        className="h-[40px] px-4 bg-primary text-white rounded-lg text-sm font-bold shrink-0 whitespace-nowrap"
      >
        추가하기
      </button>
      <button
        onClick={handleDismiss}
        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-muted-foreground flex-shrink-0"
        aria-label="닫기"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
