'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { trackEvent } from '@/lib/track'
import { sendGtmEvent } from '@/lib/gtm'
import { startKakaoLogin } from '@/lib/kakao-start'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { triggerAppInstall, isAndroidInstallEnv } from '@/lib/app-links'

// 로그인 설치 CTA를 표시하지 않을 환경 (AddToHomeScreen의 BLOCKED_ENVS + desktop)
const INSTALL_BLOCKED_ENVS = [
  'desktop', 'kakao-android', 'kakao-ios',
  'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios',
]

interface PostCTAProps {
  postId: string
  postTitle: string
  isLoggedIn?: boolean
}

export default function PostCTA({ postId, postTitle, isLoggedIn }: PostCTAProps) {
  const { isTWA, isStandalone, isCapacitor } = useAppEnvironment()
  const { status } = useAppSession()
  const pathname = usePathname()
  const loggedRef = useRef(false)
  const authKnown = typeof isLoggedIn === 'boolean' || status !== 'loading'
  const resolvedIsLoggedIn = isLoggedIn ?? status === 'authenticated'

  // null = 아직 클라이언트 계산 전 (SSR 안전)
  const [installCtaVisible, setInstallCtaVisible] = useState<boolean | null>(null)
  const [isStartingSignup, setIsStartingSignup] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  // 로그인 상태에서 설치 CTA 표시 여부를 클라이언트에서 계산
  useEffect(() => {
    if (!authKnown) return
    if (!resolvedIsLoggedIn) {
      setInstallCtaVisible(false)
      return
    }
    const env = detectEnv()
    const pwaInstalled = localStorage.getItem('pwa_installed') === '1'
    const blocked = INSTALL_BLOCKED_ENVS.includes(env) || pwaInstalled || isTWA || isStandalone || isCapacitor
    setInstallCtaVisible(!blocked)
    setIsAndroid(isAndroidInstallEnv())
  }, [authKnown, resolvedIsLoggedIn, isTWA, isStandalone, isCapacitor])

  // 노출 이벤트 — 실제 렌더되는 CTA에 대해서만 1회 전송
  // (환경 가드 제거: 비회원 가입 CTA는 앱/TWA/standalone 포함 모든 환경에서 노출/기록.
  //  회원 설치 CTA는 아래 installCtaVisible 가드(blocked에 isCapacitor·isTWA·isStandalone 포함)로 차단됨)
  useEffect(() => {
    if (loggedRef.current) return

    if (!authKnown) return

    if (!resolvedIsLoggedIn) {
      // 비회원 가입 CTA는 항상 표시 → 즉시 기록
      loggedRef.current = true
      const props = { cta_type: 'signup', post_id: postId, post_title: postTitle }
      trackEvent('post_cta_shown', props)
      sendGtmEvent('post_cta_shown', props)
      // (2026-06-08) 띠배너 억제 제거 — 글 상세 정독 동선 배너(SignupPromptBanner read_complete) 허용.
      //   PostCTA(하단 인라인)와 정독 완료 띠배너 공존, 효과는 타이밍 A/B로 측정.
      return
    }

    // 로그인: installCtaVisible 확정 후에만 기록
    if (installCtaVisible === null) return
    if (!installCtaVisible) return

    loggedRef.current = true
    const props = { cta_type: 'install', post_id: postId, post_title: postTitle }
    trackEvent('post_cta_shown', props)
    sendGtmEvent('post_cta_shown', props)
  }, [isTWA, isStandalone, isCapacitor, authKnown, resolvedIsLoggedIn, installCtaVisible, postId, postTitle])

  // 비회원 가입 CTA는 환경 무관 항상 노출(앱에서도 가입 전환 유지).
  // 회원 설치 CTA는 installCtaVisible 가드(blocked = isCapacitor·isTWA·isStandalone·인앱·desktop 포함)에서 차단된다.

  function handleClick() {
    const ctaType = resolvedIsLoggedIn ? 'install' : 'signup'
    const props = { cta_type: ctaType, post_id: postId, post_title: postTitle }
    trackEvent('post_cta_clicked', props)
    sendGtmEvent('post_cta_clicked', props)

    if (!resolvedIsLoggedIn) {
      setIsStartingSignup(true)
      window.setTimeout(() => startKakaoLogin(pathname), 0)
    } else {
      // 안드로이드 = Play스토어 / iOS = PWA 홈화면 추가
      triggerAppInstall('post_cta')
    }
  }

  // 비회원 가입 CTA — 모바일/데스크탑 모두 표시
  if (!authKnown) return null

  if (!resolvedIsLoggedIn) {
    return (
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-3">
        <p className="text-body text-foreground leading-snug m-0 flex flex-col">
          <span>우리 또래 이야기,</span>
          <span>같이 나눠보세요</span>
        </p>
        <button
          onClick={handleClick}
          disabled={isStartingSignup}
          aria-busy={isStartingSignup}
          className="shrink-0 min-h-[52px] px-4 rounded-lg text-caption font-bold flex items-center gap-1.5 whitespace-nowrap transition-all hover:brightness-95"
          style={{ background: '#FEE500', color: '#191919' }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="#191919" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M10 2C5.58 2 2 5.02 2 8.75c0 2.34 1.39 4.4 3.5 5.6-.15.54-.55 1.97-.63 2.27-.1.37.14.37.3.27.12-.08 1.9-1.28 2.67-1.8.7.1 1.42.16 2.16.16 4.42 0 8-3.02 8-6.75C18 5.02 14.42 2 10 2Z" />
          </svg>
          {isStartingSignup ? '카카오로 이동 중...' : '1초 만에 가입하기'}
        </button>
      </div>
    )
  }

  // 로그인: 계산 전(null) 또는 숨김(false) → 렌더 없음
  if (installCtaVisible !== true) return null

  // 로그인 모바일 웹 앱 설치 CTA
  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-3">
      <p className="text-body text-foreground leading-snug m-0">
        앱으로 설치하면 더 빠르게 읽을 수 있어요
      </p>
      <button
        onClick={handleClick}
        className="shrink-0 min-h-[52px] px-4 rounded-lg bg-primary text-white text-caption font-semibold"
      >
        {isAndroid ? <>앱<br />다운받기</> : <>홈 화면에<br />추가하기</>}
      </button>
    </div>
  )
}
