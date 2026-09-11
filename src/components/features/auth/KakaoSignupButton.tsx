'use client'

import { useState } from 'react'
import { sendGtmEvent, getStoredUtm, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { startKakaoLogin } from '@/lib/kakao-start'
import { buildKakaoClickTelemetry, type KakaoClickSource } from '@/lib/telemetry/kakao-click-source'

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
    // 🔴 payload 는 공용 빌더 하나로만 만든다 — `from` allowlist 정규화와
    //    `measurement_version` 을 호출부마다 다시 쓰면 축이 갈라진다.
    //    GTM·EventLog 두 파이프에 **같은 값**을 싣는다.
    const props = buildKakaoClickTelemetry({ from: gtmFrom, browserEnv: getBrowserEnv() })
    if (gtmFrom) {
      sendGtmEvent('kakao_button_click', { ...props, ...getStoredUtm() })
    }
    // ⚠️ 이것은 사이트 전체 카카오 로그인 시작이다. 가입 배너 CTA 클릭(`signup_banner_clicked`)과
    //    별도 지표로 유지한다 — 섞으면 로그인 화면 클릭이 배너 성과로 잡힌다.
    trackEvent('kakao_button_click', { ...props })
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
