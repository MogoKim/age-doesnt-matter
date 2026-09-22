'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { trackEvent } from '@/lib/track'
import { sendGtmEvent } from '@/lib/gtm'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { triggerAppInstall, isAndroidExternalBrowserEnv } from '@/lib/app-links'

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
  const loggedRef = useRef(false)
  const authKnown = typeof isLoggedIn === 'boolean' || status !== 'loading'
  const resolvedIsLoggedIn = isLoggedIn ?? status === 'authenticated'

  // null = 아직 클라이언트 계산 전 (SSR 안전)
  const [installCtaVisible, setInstallCtaVisible] = useState<boolean | null>(null)
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
    // Android 외부 브라우저(Chrome·Whale·Samsung Internet 등)만 Play스토어 유도 대상.
    // 앱 컨테이너(TWA·Capacitor·standalone)는 아래 blocked에서 따로 걸러진다.
    const android = isAndroidExternalBrowserEnv()
    // 안드로이드가 아닌 경로(iOS Safari)는 triggerAppInstall이 'pwa-prompt' 이벤트만 쏘는데,
    // 그 리스너는 AddToHomeScreen이 NEXT_PUBLIC_PWA_INSTALL_ENABLED==='true'일 때만 등록한다.
    // 플래그가 꺼져 있으면 눌러도 화면에 아무 변화가 없는 헛버튼이 되므로 CTA 자체를 감춘다.
    // (환경이 아니라 플래그를 보고 판정하므로, 플래그를 켜면 iOS 안내가 그대로 되살아난다.)
    const pwaPromptUnavailable = !android && process.env.NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true'
    const blocked =
      INSTALL_BLOCKED_ENVS.includes(env) || pwaInstalled || isTWA || isStandalone || isCapacitor || pwaPromptUnavailable
    setInstallCtaVisible(!blocked)
    setIsAndroid(android)
  }, [authKnown, resolvedIsLoggedIn, isTWA, isStandalone, isCapacitor])

  // 마운트 이벤트이며 viewport 노출 이벤트가 아니다.
  // IntersectionObserver 없이 이 effect 실행 시 1회 전송하므로 실제 노출률 계산에는 사용하지 않는다.
  // (환경 가드 제거: 비회원 가입 CTA는 앱/TWA/standalone 포함 모든 환경에서 마운트/기록.
  //  회원 설치 CTA는 아래 installCtaVisible 가드(blocked에 isCapacitor·isTWA·isStandalone 포함)로 차단됨)
  useEffect(() => {
    if (loggedRef.current) return

    if (!authKnown) return

    // Project BRIDGE(2026-09-22): 비회원 가입 CTA 제거 → cta_type='signup' shown 기록도 중단.
    if (!resolvedIsLoggedIn) return

    // 로그인: installCtaVisible 확정 후에만 기록
    if (installCtaVisible === null) return
    if (!installCtaVisible) return

    loggedRef.current = true
    const props = { cta_type: 'install', post_id: postId, post_title: postTitle }
    trackEvent('post_cta_shown', props)
    sendGtmEvent('post_cta_shown', props)
  }, [isTWA, isStandalone, isCapacitor, authKnown, resolvedIsLoggedIn, installCtaVisible, postId, postTitle])

  // 회원 설치 CTA는 installCtaVisible 가드(blocked = isCapacitor·isTWA·isStandalone·인앱·desktop 포함)에서 차단된다.

  function handleClick() {
    const props = { cta_type: 'install', post_id: postId, post_title: postTitle }
    trackEvent('post_cta_clicked', props)
    sendGtmEvent('post_cta_clicked', props)

    // 안드로이드 = Play스토어 / iOS = PWA 홈화면 추가
    triggerAppInstall('post_cta')
  }

  if (!authKnown) return null

  // Project BRIDGE(2026-09-22): 비회원 카카오 가입 CTA 제거.
  // 소란소란 이주 유도와 메시지가 충돌하므로 비회원에게는 아무것도 띄우지 않는다.
  // 아래 로그인 사용자용 앱 설치 CTA는 그대로 유지한다.
  if (!resolvedIsLoggedIn) return null

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
        className="shrink-0 min-h-control px-4 rounded-lg bg-primary text-white text-caption font-semibold"
      >
        {isAndroid ? <>앱<br />다운받기</> : <>홈 화면에<br />추가하기</>}
      </button>
    </div>
  )
}
