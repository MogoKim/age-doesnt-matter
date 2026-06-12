'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAppSession } from '@/components/common/AppSessionProvider'
import {
  gtmSignupBannerEligible,
  gtmSignupBannerShown,
  gtmSignupBannerClicked,
  gtmSignupBannerDismissed,
  gtmInappRedirectAttempted,
  gtmInappRedirectSuccess,
} from '@/lib/gtm'
import { startKakaoLogin } from '@/lib/kakao-start'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { trackEvent } from '@/lib/track'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'

// 인앱 환경 (카카오/네이버/구글 앱) 감지 — CTA를 외부브라우저 유도로 변경
const INAPP_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp'] as const
type InappEnv = typeof INAPP_ENVS[number]

function isInappEnv(env: string): env is InappEnv {
  return (INAPP_ENVS as readonly string[]).includes(env)
}

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────
const MAX_SHOWS = 4

// 노출 타이밍(UT 위너 고정): 정독 거의 완료(85%) 후 발동. 안 읽고 떠나면 60초 백스톱.
const READ_COMPLETE_SCROLL = 0.85
const BACKSTOP_MS = 60_000

const EXCLUDED_PATHS = [
  '/login', '/onboarding', '/signup', '/my', '/admin',
  '/terms', '/privacy', '/rules', '/about', '/contact',
  '/grade', '/error', '/_next', '/api',
  '/',  // 홈: SignupCard가 중반부에 이미 있으므로 SignupPromptBanner 비활성화
]
const CONTENT_PATHS = ['/community/', '/magazine/', '/jobs/', '/best']

// localStorage keys
const KEY_COUNT = 'signup_prompt_count'
const KEY_DONE = 'signup_prompt_done'
// sessionStorage keys
const SESSION_SHOWN = 'signup_prompt_shown_this_session'

// ──────────────────────────────────────────────
// 배너 콘텐츠 (UT 위너: C 공감형 고정 — 문구 A/B/C 실험 종료 2026-06-09)
// ──────────────────────────────────────────────
const BANNER_CONTENT = {
  emoji: '👋',
  headline: '나만 이런 게 아니었네?',
  sub: '우리끼리 편하게 수다 떨어봐요',
  cta: '카카오 한 번 클릭으로 가입',
} as const

// ──────────────────────────────────────────────
// 순수 유틸
// ──────────────────────────────────────────────
function isActivePath(p: string): boolean {
  // '/'는 정확히 매칭 (startsWith 시 모든 경로 차단되는 버그 방지)
  if (EXCLUDED_PATHS.some(ep => ep === '/' ? p === '/' : p.startsWith(ep))) return false
  return CONTENT_PATHS.some(cp => {
    return cp.endsWith('/') ? p.startsWith(cp) : p === cp || p.startsWith(cp + '/')
  })
}

function canShow(): boolean {
  if (localStorage.getItem(KEY_DONE) === '1') return false
  if (sessionStorage.getItem(SESSION_SHOWN)) return false
  return true
}

function getPromptCount(): number {
  return parseInt(localStorage.getItem(KEY_COUNT) ?? '0', 10)
}

function incrementCount(): void {
  const next = getPromptCount() + 1
  localStorage.setItem(KEY_COUNT, String(next))
  if (next >= MAX_SHOWS) {
    localStorage.setItem(KEY_DONE, '1')
  }
}

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────
// auto-trigger 카운트다운 초
const AUTO_TRIGGER_COUNTDOWN_S = 5

// sessionStorage: 탭 내 1회 제한 (취소 또는 완료 시 세팅)
const SESSION_AUTO_TRIGGERED = 'signup_auto_triggered'

// auto-trigger: 유효한 인앱 utm_source 목록
const INAPP_UTM_SOURCES = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp'] as const

// ──────────────────────────────────────────────
// 컴포넌트
// ──────────────────────────────────────────────
export function SignupPromptBanner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session, status } = useAppSession()
  const isLoggedIn = status === 'authenticated'
  const { isTWA } = useAppEnvironment() // TWA(앱)는 게이트 실험(twa01_entry_gate)이 담당 → 웹 타이밍 배너 OFF(오염 차단)
  const createdAt = session?.user?.createdAt ? String(session.user.createdAt) : undefined

  // ?signup=1 + 유효 utm_source 감지 (클라이언트에서 직접 읽기 — layout은 searchParams 미지원)
  const signupAutoTrigger =
    searchParams.get('signup') === '1' &&
    INAPP_UTM_SOURCES.includes(searchParams.get('utm_source') as typeof INAPP_UTM_SOURCES[number])
  const signupUtmSource = searchParams.get('utm_source') ?? ''
  const [visible, setVisible] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [currentEnv, setCurrentEnv] = useState<string>('android-chrome')

  // auto-trigger 카운트다운 상태
  const [autoVisible, setAutoVisible] = useState(false)
  const [autoCountdown, setAutoCountdown] = useState(AUTO_TRIGGER_COUNTDOWN_S)
  const autoCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrolledRef = useRef(false)
  const tryFireRef = useRef<() => void>(() => {})

  // 마운트 시 환경 감지 (SSR 안전)
  useEffect(() => {
    setCurrentEnv(detectEnv())
  }, [])

  // ── ?signup=1 auto-trigger: 인앱→외부브라우저 도착 시 카운트다운 배너 ──
  useEffect(() => {
    if (status === 'loading') return
    if (!signupAutoTrigger) return
    if (isLoggedIn) return
    if (sessionStorage.getItem(SESSION_AUTO_TRIGGERED)) return

    // 조건 통과: GTM 이벤트 + 카운트다운 시작
    gtmInappRedirectSuccess(signupUtmSource ?? '')
    sessionStorage.setItem(SESSION_AUTO_TRIGGERED, '1')
    setAutoCountdown(AUTO_TRIGGER_COUNTDOWN_S)
    setAutoVisible(true)

    autoCountdownRef.current = setInterval(() => {
      setAutoCountdown(prev => {
        if (prev <= 1) {
          if (autoCountdownRef.current) clearInterval(autoCountdownRef.current)
          // 카운트다운 만료 → 자동 OAuth 실행
          setIsStarting(true)
          startKakaoLogin(pathname)
          return 0
        }
        return prev - 1
      })
    }, 1_000)

    return () => {
      if (autoCountdownRef.current) clearInterval(autoCountdownRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupAutoTrigger, status])

  const handleAutoTriggerDismiss = () => {
    if (autoCountdownRef.current) clearInterval(autoCountdownRef.current)
    setAutoVisible(false)
  }

  const handleAutoTriggerNow = () => {
    if (autoCountdownRef.current) clearInterval(autoCountdownRef.current)
    setAutoVisible(false)
    setIsStarting(true)
    startKakaoLogin(pathname)
  }

  // ── 인앱→Chrome 재접속 backfill ──
  useEffect(() => {
    if (!isLoggedIn || !createdAt) return
    if (localStorage.getItem('signup_completed_at')) return
    if (Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000) {
      localStorage.setItem('signup_completed_at', createdAt)
    }
  }, [isLoggedIn, createdAt])

  // ── 타이머 (Tab Visibility API 포함) ──
  useEffect(() => {
    if (status === 'loading') return
    if (isLoggedIn || isTWA || !isActivePath(pathname)) return

    // 노출 타이밍 고정(UT 위너): 스크롤 85%가 주 트리거, 60초 백스톱
    const fireDelay = BACKSTOP_MS

    let alreadyFired = false
    let timerFired = false
    let timerId: ReturnType<typeof setTimeout> | null = null

    const tryFire = () => {
      if (alreadyFired) return
      if (!timerFired && !scrolledRef.current) return  // 백스톱(60초) 또는 정독 85% 중 충족
      if (!canShow()) return
      alreadyFired = true
      if (timerId) { clearTimeout(timerId); timerId = null }

      const count = getPromptCount()
      incrementCount()
      sessionStorage.setItem(SESSION_SHOWN, '1')
      setVisible(true)
      gtmSignupBannerEligible(pathname)
      gtmSignupBannerShown(pathname, count + 1)
      // 노출 측정 (EventLog, _anon_sid 자동) — 발동 시점 정독률
      const scrollableNow = document.documentElement.scrollHeight - window.innerHeight
      const scrollAt = scrollableNow <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((window.scrollY / scrollableNow) * 100)))
      trackEvent('signup_banner_shown', { scroll_at_show: scrollAt })
    }

    tryFireRef.current = tryFire

    const handleVisibility = () => {
      if (document.hidden) {
        if (timerId) { clearTimeout(timerId); timerId = null }
      } else {
        if (!alreadyFired && !timerFired) {
          timerId = setTimeout(() => { timerFired = true; tryFire() }, fireDelay)
        }
      }
    }

    if (!document.hidden) {
      timerId = setTimeout(() => { timerFired = true; tryFire() }, fireDelay)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timerId) clearTimeout(timerId)
      document.removeEventListener('visibilitychange', handleVisibility)
      tryFireRef.current = () => {}
    }
  }, [pathname, isLoggedIn, status, isTWA])

  // ── 스크롤 감지 ──
  useEffect(() => {
    if (status === 'loading') return
    if (isLoggedIn || isTWA || !isActivePath(pathname)) return
    // 정독 85% 완료 시 발동(고정)
    const scrollThreshold = READ_COMPLETE_SCROLL
    // pathname 변경 시 현재 스크롤 위치로 초기화 (scroll effect가 timer effect보다 나중에 실행됨)
    const docH0 = document.documentElement.scrollHeight - window.innerHeight
    scrolledRef.current = docH0 < 100 || window.scrollY / docH0 >= scrollThreshold

    const handleScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      if (docH < 100 || window.scrollY / docH >= scrollThreshold) {
        scrolledRef.current = true
        tryFireRef.current() // 타이머 이미 경과했으면 즉시 발동
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [pathname, isLoggedIn, status, isTWA])

  // ── Body scroll lock ──
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [visible])

  // ── auto-trigger 카운트다운 배너 (일반 배너보다 우선 렌더) ──
  if (autoVisible) {
    const utmLabel =
      signupUtmSource === 'kakao-android' || signupUtmSource === 'kakao-ios'
        ? '카카오톡'
        : signupUtmSource === 'naver-inapp'
          ? '네이버'
          : '앱'
    return (
      <>
        <div
          className="fixed inset-0 z-[149] bg-black/50 animate-in fade-in duration-300"
          onClick={handleAutoTriggerDismiss}
          aria-hidden="true"
        />
        <div
          data-testid="signup-auto-trigger-banner"
          className="fixed bottom-0 left-0 right-0 z-[150] animate-in slide-in-from-bottom duration-300"
        >
          <div className="bg-card border-t border-border shadow-2xl px-4 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="max-w-lg mx-auto">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">👋</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-body leading-snug text-foreground">
                    {utmLabel}에서 오셨군요!
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {autoCountdown}초 후 자동으로 가입을 시작해요
                  </p>
                </div>
                <button
                  onClick={handleAutoTriggerDismiss}
                  className="shrink-0 w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              <button
                data-testid="signup-auto-trigger-cta"
                onClick={handleAutoTriggerNow}
                disabled={isStarting}
                className="mt-3 flex items-center justify-center w-full h-[52px] bg-[#FEE500] text-[#191919] rounded-xl font-bold text-[15px] disabled:opacity-70 transition-opacity"
              >
                {isStarting ? '카카오로 이동 중...' : '💛 지금 바로 시작하기'}
              </button>
              <button
                onClick={handleAutoTriggerDismiss}
                className="mt-2 w-full text-center text-xs text-muted-foreground py-2"
              >
                잠깐, 직접 할게요
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!visible) return null

  const content = BANNER_CONTENT

  const inapp = isInappEnv(currentEnv)

  // 인앱 환경별 CTA 텍스트
  const inappCtaText = currentEnv === 'kakao-android' || currentEnv === 'kakao-ios'
    ? '카카오 밖에서 가입하기'
    : '브라우저에서 가입하기'

  const handleDismiss = () => {
    gtmSignupBannerDismissed(pathname, getPromptCount())
    setVisible(false)
  }

  const handleCTAClick = () => {
    if (inapp) {
      // 인앱 환경: 외부브라우저로 현재 페이지 열기 + signup=1 파라미터
      gtmSignupBannerClicked(pathname, 'external_browser')
      const targetUrl = new URL(window.location.href)
      targetUrl.searchParams.set('signup', '1')
      targetUrl.searchParams.set('utm_source', currentEnv)
      targetUrl.searchParams.set('utm_medium', 'signup_banner')

      if (currentEnv === 'kakao-android') {
        gtmInappRedirectAttempted(currentEnv, 'intent')
        navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})
        const host = targetUrl.hostname + targetUrl.pathname + targetUrl.search
        location.href = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`
      } else if (currentEnv === 'kakao-ios') {
        gtmInappRedirectAttempted(currentEnv, 'clipboard')
        navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})
        // iOS: 클립보드 복사 후 Safari에서 붙여넣기 안내는 AddToHomeScreen 토스트 재사용 불가
        // → 배너 UI 자체에서 안내 (닫기 대신 안내 메시지로 전환은 Phase 2)
        setVisible(false)
      } else {
        // naver-inapp, google-inapp: Android intent 시도
        gtmInappRedirectAttempted(currentEnv, 'intent')
        navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})
        if (/android/i.test(navigator.userAgent)) {
          const host = targetUrl.hostname + targetUrl.pathname + targetUrl.search
          location.href = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`
        } else {
          setVisible(false)
        }
      }
    } else {
      // 일반 브라우저: 직접 카카오 OAuth
      gtmSignupBannerClicked(pathname, 'kakao_oauth')
      setIsStarting(true)
      startKakaoLogin(pathname)
    }
  }

  return (
    <>
      {/* 딤 오버레이 */}
      <div
        className="fixed inset-0 z-[149] bg-black/50 animate-in fade-in duration-300"
        onClick={handleDismiss}
        aria-hidden="true"
      />
      {/* 배너 */}
      <div className="fixed bottom-0 left-0 right-0 z-[150] animate-in slide-in-from-bottom duration-300">
        <div className="bg-card border-t border-border shadow-2xl px-4 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-lg mx-auto">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">{content.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-body leading-snug text-foreground">
                  {content.headline}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {content.sub}
                </p>
              </div>
              {/* 닫기 버튼: 44×44px (5060 터치 타겟 기준) */}
              <button
                onClick={handleDismiss}
                className="shrink-0 w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <button
              data-testid="signup-banner-cta"
              onClick={handleCTAClick}
              disabled={isStarting}
              className="mt-3 flex items-center justify-center w-full h-[52px] bg-[#FEE500] text-[#191919] rounded-xl font-bold text-[15px] disabled:opacity-70 transition-opacity"
            >
              {isStarting ? '카카오로 이동 중...' : `💛 ${inapp ? inappCtaText : content.cta}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
