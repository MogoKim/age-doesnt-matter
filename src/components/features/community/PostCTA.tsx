'use client'

import { useEffect, useRef, startTransition, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { kakaoSignIn } from '@/app/login/actions'
import { trackEvent } from '@/lib/track'
import { sendGtmEvent } from '@/lib/gtm'
import { detectEnv } from '@/components/common/AddToHomeScreen'

// 로그인 설치 CTA를 표시하지 않을 환경 (AddToHomeScreen의 BLOCKED_ENVS + desktop)
const INSTALL_BLOCKED_ENVS = [
  'desktop', 'kakao-android', 'kakao-ios',
  'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios',
]

interface PostCTAProps {
  postId: string
  postTitle: string
  isLoggedIn: boolean
}

export default function PostCTA({ postId, postTitle, isLoggedIn }: PostCTAProps) {
  const { isTWA, isStandalone } = useAppEnvironment()
  const pathname = usePathname()
  const loggedRef = useRef(false)

  // null = 아직 클라이언트 계산 전 (SSR 안전)
  const [installCtaVisible, setInstallCtaVisible] = useState<boolean | null>(null)

  // 로그인 상태에서 설치 CTA 표시 여부를 클라이언트에서 계산
  useEffect(() => {
    if (!isLoggedIn) {
      setInstallCtaVisible(false)
      return
    }
    const env = detectEnv()
    const pwaInstalled = localStorage.getItem('pwa_installed') === '1'
    const blocked = INSTALL_BLOCKED_ENVS.includes(env) || pwaInstalled || isTWA || isStandalone
    setInstallCtaVisible(!blocked)
  }, [isLoggedIn, isTWA, isStandalone])

  // 노출 이벤트 — 실제 렌더되는 CTA에 대해서만 1회 전송
  useEffect(() => {
    if (isTWA || isStandalone) return
    if (loggedRef.current) return

    if (!isLoggedIn) {
      // 비회원 가입 CTA는 항상 표시 → 즉시 기록
      loggedRef.current = true
      const props = { cta_type: 'signup', post_id: postId, post_title: postTitle }
      trackEvent('post_cta_shown', props)
      sendGtmEvent('post_cta_shown', props)
      sessionStorage.setItem('signup_prompt_shown_this_session', '1')
      return
    }

    // 로그인: installCtaVisible 확정 후에만 기록
    if (installCtaVisible === null) return
    if (!installCtaVisible) return

    loggedRef.current = true
    const props = { cta_type: 'install', post_id: postId, post_title: postTitle }
    trackEvent('post_cta_shown', props)
    sendGtmEvent('post_cta_shown', props)
  }, [isTWA, isStandalone, isLoggedIn, installCtaVisible, postId, postTitle])

  // TWA/standalone → 전체 숨김
  if (isTWA || isStandalone) return null

  function handleClick() {
    const ctaType = isLoggedIn ? 'install' : 'signup'
    const props = { cta_type: ctaType, post_id: postId, post_title: postTitle }
    trackEvent('post_cta_clicked', props)
    sendGtmEvent('post_cta_clicked', props)

    if (!isLoggedIn) {
      startTransition(async () => { await kakaoSignIn(pathname) })
    } else {
      window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
    }
  }

  // 비회원 가입 CTA — 모바일/데스크탑 모두 표시
  if (!isLoggedIn) {
    return (
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-3">
        <p className="text-[17px] text-foreground leading-snug m-0">
          가입하면 공감·댓글·저장까지 할 수 있어요
        </p>
        <button
          onClick={handleClick}
          className="shrink-0 min-h-[52px] px-4 rounded-lg bg-primary text-white text-[15px] font-semibold"
        >
          카카오로<br />시작하기
        </button>
      </div>
    )
  }

  // 로그인: 계산 전(null) 또는 숨김(false) → 렌더 없음
  if (installCtaVisible !== true) return null

  // 로그인 모바일 웹 앱 설치 CTA
  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-3">
      <p className="text-[17px] text-foreground leading-snug m-0">
        앱처럼 설치하면 더 빠르게 읽을 수 있어요
      </p>
      <button
        onClick={handleClick}
        className="shrink-0 min-h-[52px] px-4 rounded-lg bg-primary text-white text-[15px] font-semibold"
      >
        홈 화면에<br />추가하기
      </button>
    </div>
  )
}
