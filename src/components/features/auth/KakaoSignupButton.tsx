'use client'

import { useState } from 'react'
import { sendGtmEvent, getStoredUtm, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { startKakaoLogin } from '@/lib/kakao-start'

interface Props {
  callbackUrl?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  gtmFrom?: string
}

export default function KakaoSignupButton({ callbackUrl = '/', className, style, children, gtmFrom }: Props) {
  const [isStarting, setIsStarting] = useState(false)

  function handleClick() {
    setIsStarting(true)
    if (gtmFrom) {
      sendGtmEvent('kakao_button_click', { from: gtmFrom, browser_env: getBrowserEnv(), ...getStoredUtm() })
    }
    trackEvent('kakao_button_click', { from: gtmFrom ?? 'unknown', browser_env: getBrowserEnv() })
    window.setTimeout(() => startKakaoLogin(callbackUrl), 0)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isStarting}
      aria-busy={isStarting}
      className={className}
      style={style}
    >
      {children}
    </button>
  )
}
