'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from './AddToHomeScreen'
import { triggerAppInstall, isAndroidInstallEnv } from '@/lib/app-links'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'

const BLOCKED_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop'] as const
const KEY_INSTALLED = 'pwa_installed'
const SESSION_INLINE_SHOWN = 'pwa_inline_shown'

export default function PwaInlineBanner() {
  const { isTWA, isStandalone, isCapacitor } = useAppEnvironment()
  const [show, setShow] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true') return
    if (isTWA || isStandalone || isCapacitor) return  // 이미 앱(TWA/Capacitor)/홈화면 설치(PWA) → 설치 유도 숨김
    const env = detectEnv()
    if ((BLOCKED_ENVS as readonly string[]).includes(env)) return
    if (localStorage.getItem(KEY_INSTALLED) === '1') return
    if (sessionStorage.getItem(SESSION_INLINE_SHOWN)) return
    if (sessionStorage.getItem('signup_prompt_shown_this_session')) return  // 가입 유도 배너 노출 시 충돌 방지
    setShow(true)
    setIsAndroid(isAndroidInstallEnv())
  }, [isTWA, isStandalone, isCapacitor])

  const handleInstall = () => {
    sessionStorage.setItem(SESSION_INLINE_SHOWN, '1')
    setShow(false)
    // 안드로이드 = Play스토어 / iOS = PWA 홈화면 추가
    triggerAppInstall('inline')
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
        <p className="text-caption text-muted-foreground leading-tight mt-0.5">
          {isAndroid ? '앱으로 받으면 바로 열려요' : '홈 화면에 추가하면 바로 열려요'}
        </p>
      </div>
      <button
        onClick={handleInstall}
        className="min-h-[52px] px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold leading-tight shrink-0 whitespace-nowrap"
      >
        {isAndroid ? '받기' : '추가하기'}
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
