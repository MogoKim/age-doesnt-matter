'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from './AddToHomeScreen'
import { triggerAppInstall, isAndroidInstallEnv } from '@/lib/app-links'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'

const BLOCKED_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop'] as const

export default function FooterPwaButton() {
  const { isTWA, isStandalone, isCapacitor } = useAppEnvironment()
  const [show, setShow] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true') return
    if (isTWA || isStandalone || isCapacitor) return  // 이미 앱(TWA/Capacitor)/홈화면 설치(PWA) → 설치 유도 숨김
    const env = detectEnv()
    if (!(BLOCKED_ENVS as readonly string[]).includes(env)) {
      setShow(true)
      setIsAndroid(isAndroidInstallEnv())
    }
  }, [isTWA, isStandalone, isCapacitor])

  if (!show) return null

  return (
    <button
      onClick={() => triggerAppInstall('footer')}
      className="text-caption text-muted-foreground hover:text-foreground transition-colors"
    >
      {isAndroid ? '앱 다운받기' : '홈 화면에 추가'}
    </button>
  )
}
