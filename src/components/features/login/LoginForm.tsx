'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { sendGtmEvent, getStoredUtm, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { startKakaoLogin } from '@/lib/kakao-start'
import GateOnboardingSlides from '@/components/common/GateOnboardingSlides'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const [isStarting, setIsStarting] = useState(false)

  function handleKakaoClick() {
    setIsStarting(true)
    sendGtmEvent('kakao_button_click', { from: 'login_page', browser_env: getBrowserEnv(), ...getStoredUtm() })
    trackEvent('kakao_button_click', { from: 'login_page', browser_env: getBrowserEnv() })
    window.setTimeout(() => startKakaoLogin(callbackUrl), 0)
  }

  // C 게이트와 동일한 슬라이드 온보딩 UI 재사용(GateOnboardingSlides).
  // /login은 좌상단 뒤로가기(onBack) + "먼저 둘러볼게요"(onEscape→홈) 모두 표시.
  // 카카오 로그인 동작·tracking·callbackUrl은 handleKakaoClick에 그대로 유지.
  return (
    <>
      <h1 className="sr-only">로그인</h1>
      <GateOnboardingSlides
        onSignup={handleKakaoClick}
        starting={isStarting}
        onBack={() => router.back()}
        onEscape={() => router.push('/')}
      />
    </>
  )
}
