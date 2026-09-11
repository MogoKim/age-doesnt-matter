'use client'

import { useState } from 'react'
import { sendGtmEvent, getStoredUtm, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { startKakaoLogin } from '@/lib/kakao-start'
import { normalizeKakaoClickSource, type KakaoClickSource } from '@/lib/telemetry/kakao-click-source'

interface Props {
  callbackUrl?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  /** 로그인 시작 위치. allowlist 밖 값은 `unknown` 으로 접힌다 */
  gtmFrom?: KakaoClickSource
}

export default function KakaoSignupButton({ callbackUrl = '/', className, style, children, gtmFrom }: Props) {
  const [isStarting, setIsStarting] = useState(false)

  function handleClick() {
    setIsStarting(true)
    // 🔴 `from` 은 allowlist 로만 정규화한다 — 자유 문자열이 들어오면 "어디서 로그인을 시작했나"를
    //    합산할 수 없게 된다. GTM·EventLog 두 파이프에 **같은 값**을 싣는다.
    const from = normalizeKakaoClickSource(gtmFrom)
    if (gtmFrom) {
      sendGtmEvent('kakao_button_click', { from, browser_env: getBrowserEnv(), ...getStoredUtm() })
    }
    // ⚠️ 이것은 사이트 전체 카카오 로그인 시작이다. 가입 배너 CTA 클릭(`signup_banner_clicked`)과
    //    별도 지표로 유지한다 — 섞으면 로그인 화면 클릭이 배너 성과로 잡힌다.
    trackEvent('kakao_button_click', { from, browser_env: getBrowserEnv() })
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
