'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from './AddToHomeScreen'

const BLOCKED_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop'] as const

export default function FooterPwaButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const env = detectEnv()
    if (!(BLOCKED_ENVS as readonly string[]).includes(env)) {
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <button
      onClick={() =>
        window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
      }
      className="text-caption text-muted-foreground hover:text-foreground transition-colors"
    >
      홈 화면에 추가
    </button>
  )
}
