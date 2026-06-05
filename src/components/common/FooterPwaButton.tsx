'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from './AddToHomeScreen'
import { triggerAppInstall, isAndroidInstallEnv } from '@/lib/app-links'

const BLOCKED_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop'] as const

export default function FooterPwaButton() {
  const [show, setShow] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true') return
    const env = detectEnv()
    if (!(BLOCKED_ENVS as readonly string[]).includes(env)) {
      setShow(true)
      setIsAndroid(isAndroidInstallEnv())
    }
  }, [])

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
