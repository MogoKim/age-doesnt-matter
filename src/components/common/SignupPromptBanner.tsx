'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAppSession } from '@/components/common/AppSessionProvider'
import {
  gtmSignupBannerEligible,
  gtmSignupBannerShown,
  gtmSignupBannerClicked,
  gtmSignupBannerDismissed,
  gtmInappRedirectAttempted,
  gtmInappRedirectSuccess,
  gtmPlayStoreClick,
  getBrowserEnv,
} from '@/lib/gtm'
import { startKakaoLogin } from '@/lib/kakao-start'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { trackEvent } from '@/lib/track'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { getExperimentVariant } from '@/lib/experiments/assign'
import { buildPlayStoreUrl } from '@/lib/app-links'
import { isCommentEntryActive, subscribeCommentEntryActive } from '@/lib/comment-entry-state'
import {
  ANDROID_CONVERSION_CONTENT,
  ANDROID_CONVERSION_EVENTS,
  ANDROID_CONVERSION_EXPERIMENT_ID,
  ANDROID_CONVERSION_SURFACE,
  APP_CARD_PLAY_MEDIUM,
  isAndroidConversionSegment,
  isAndroidConversionVariant,
  type AndroidConversionVariant,
} from '@/lib/experiments/android-conversion'
import {
  INAPP_REDIRECT_EVENTS,
  arrivalRedirectMethod,
  buildInappRedirectProps,
  redirectTargetOf,
  type InappRedirectMethod,
} from '@/lib/inapp-redirect'

// 인앱 환경 (카카오/네이버/구글 앱) 감지 — CTA를 외부브라우저 유도로 변경
const INAPP_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp'] as const
type InappEnv = typeof INAPP_ENVS[number]

function isInappEnv(env: string): env is InappEnv {
  return (INAPP_ENVS as readonly string[]).includes(env)
}

function isIOSUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent)
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

const IOS_SIGNUP_CTA = '카카오로 1초 가입'

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
  const { isTWA, isCapacitor, isStandalone } = useAppEnvironment() // 웹 정독 배너: TWA(2026-06-13 게이트 종료) + Capacitor 앱 제외(앱 글상세 가입 유도는 PostCTA 인라인 CTA가 담당)
  const createdAt = session?.user?.createdAt ? String(session.user.createdAt) : undefined

  // ?signup=1 + 유효 utm_source 감지 (클라이언트에서 직접 읽기 — layout은 searchParams 미지원)
  const signupAutoTrigger =
    searchParams.get('signup') === '1' &&
    INAPP_UTM_SOURCES.includes(searchParams.get('utm_source') as typeof INAPP_UTM_SOURCES[number])
  const signupUtmSource = searchParams.get('utm_source') ?? ''
  const [visible, setVisible] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [currentEnv, setCurrentEnv] = useState<string>('android-chrome')
  const [isIOS, setIsIOS] = useState(false)

  // auto-trigger 카운트다운 상태
  const [autoVisible, setAutoVisible] = useState(false)
  const [autoCountdown, setAutoCountdown] = useState(AUTO_TRIGGER_COUNTDOWN_S)
  const autoCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrolledRef = useRef(false)
  const tryFireRef = useRef<() => void>(() => {})

  // ── Android 외부 브라우저 비회원 전환 실험(android_conversion_a2_b2) ──
  //  variant가 빈 문자열이면 실험 대상이 아니거나 시작 전 → 기존 배너 그대로 동작(회귀 0).
  const [variant, setVariant] = useState<AndroidConversionVariant | ''>('')
  // 발동 원인(read_complete | backstop) — 노출/클릭/닫기 이벤트에 함께 싣는다
  const triggerRef = useRef<'read_complete' | 'backstop'>('backstop')

  // 마운트 시 환경 감지 (SSR 안전)
  useEffect(() => {
    setCurrentEnv(detectEnv())
    setIsIOS(isIOSUserAgent(navigator.userAgent))
  }, [])

  // 실험 배정 — 세션 확정 후(로그인 여부가 세그먼트 조건) 1회.
  //  세그먼트: 비회원 + Android 외부 브라우저(Whale·Chrome·Samsung Internet 등).
  //  제외: 회원 / 인앱브라우저 / WebView / iOS / desktop / TWA·Capacitor·standalone.
  useEffect(() => {
    if (status === 'loading') return
    const eligible = isAndroidConversionSegment({
      userAgent: navigator.userAgent,
      isLoggedIn,
      isTWA,
      isCapacitor,
      isStandalone,
    })
    if (!eligible) {
      setVariant('')
      return
    }
    const assigned = getExperimentVariant(ANDROID_CONVERSION_EXPERIMENT_ID)
    setVariant(isAndroidConversionVariant(assigned) ? assigned : '')
  }, [status, isLoggedIn, isTWA, isCapacitor, isStandalone])

  // variant를 ref로도 들고 있는다 — 타이머 effect 의존성에 넣으면 배정이 늦게 확정될 때
  // 60초 백스톱 타이머가 재시작돼 노출 타이밍이 밀린다(기존 트리거 정책 보존).
  const variantRef = useRef<AndroidConversionVariant | ''>('')
  useEffect(() => { variantRef.current = variant }, [variant])

  // 인앱 여부도 같은 이유로 ref로 들고 있는다.
  //   `currentEnv`는 마운트 직후 `detectEnv()`로 확정되는데, 이걸 타이머 effect 의존성에 넣으면
  //   확정되는 순간 effect가 재실행돼 **비인앱의 60초 백스톱이 리셋된다.**
  //   이번 변경은 인앱만 건드리는 것이므로 비인앱 타이밍을 1ms도 바꾸면 안 된다.
  const inappRef = useRef(false)
  useEffect(() => { inappRef.current = isInappEnv(currentEnv) }, [currentEnv])

  // ── ?signup=1 auto-trigger: 인앱→외부브라우저 도착 시 카운트다운 배너 ──
  useEffect(() => {
    if (status === 'loading') return
    if (!signupAutoTrigger) return
    if (isLoggedIn) return
    if (sessionStorage.getItem(SESSION_AUTO_TRIGGERED)) return

    // 조건 통과: GTM 이벤트 + 카운트다운 시작
    gtmInappRedirectSuccess(signupUtmSource ?? '')
    // [계측] 외부 브라우저 도착을 EventLog에도 남긴다 — attempted와 짝을 이뤄 퍼널이 완성된다.
    //   `source`는 **떠나온 인앱 환경**(utm_source), `browser_env`는 **도착한 지금 환경**이다.
    //   `redirect_method`는 도착 페이지가 직접 알 수 없으므로 떠나온 채널로 역추론한다
    //   (kakao-ios는 clipboard 경유라 intent로 기록하면 틀린다 — arrivalRedirectMethod 참고).
    const arrivedFrom = signupUtmSource || 'unknown'
    trackEvent(
      INAPP_REDIRECT_EVENTS.opened,
      buildInappRedirectProps({
        surface: 'signup_prompt_banner',
        source: arrivedFrom,
        browserEnv: getBrowserEnv(),
        userAgent: navigator.userAgent,
        path: pathname,
        target: `${window.location.pathname}${window.location.search}`,
        method: arrivalRedirectMethod(arrivedFrom),
        ctaType: 'external_browser',
        utmSource: signupUtmSource || undefined,
        utmMedium: searchParams.get('utm_medium') ?? undefined,
      }),
    )
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
    if (isLoggedIn || isTWA || isCapacitor || !isActivePath(pathname)) return

    // 노출 타이밍 고정(UT 위너): 스크롤 85%가 주 트리거, 60초 백스톱
    const fireDelay = BACKSTOP_MS

    let alreadyFired = false
    let timerFired = false
    let timerId: ReturnType<typeof setTimeout> | null = null

    const tryFire = () => {
      if (alreadyFired) return
      // [F20 §8] 인앱은 **정독 85% 도달만** 트리거다 — 60초 백스톱으로는 뜨지 않는다.
      //   인앱 사용자는 백스톱이 정독보다 먼저 걸려 글을 42%밖에 안 읽은 시점에 배너를 만났고
      //   (노출 시점 정독률 중앙값, 데스크탑은 86%), 그래서 2.7초 만에 ✕로 치웠다(3초 내 닫힘 63.6%).
      //   구조적 방해(스크롤 잠금·바깥 탭 닫기)는 PR #318에서 이미 제거했으므로 남은 원인은 타이밍이다.
      //   ⚠️ 비인앱은 기존 그대로 — 백스톱 또는 정독 중 하나만 충족하면 발동한다.
      //      (Android 외부 브라우저는 android_conversion_a2_b2 실험 중이라 분모를 건드리면 안 된다)
      if (inappRef.current) {
        if (!scrolledRef.current) return
      } else if (!timerFired && !scrolledRef.current) {
        return
      }
      // [PR-C1] 댓글 입력이 화면에 있는 동안에는 **미룬다**(취소가 아니다).
      //   배너는 정독 85%에 뜨는데 그 지점이 사용자가 댓글 입력에 닿는 순간이라, 함께 깔리는
      //   `fixed inset-0` dim이 입력을 물리적으로 막아왔다. 글 상세에서는 댓글 입력이 우선이다.
      //   ⚠️ alreadyFired를 세우기 **전에** 빠지므로 트리거가 소모되지 않는다 —
      //      입력창이 화면을 벗어나면 아래 구독이 tryFire를 다시 부른다.
      //   ⚠️ 문구·CTA·타깃·노출 횟수·실험 정의는 그대로다. 시점만 양보한다.
      //      variant 분기 이전이라 A/B 두 팔에 동일하게 적용된다(비교 편향 없음).
      if (isCommentEntryActive()) return
      if (!canShow()) return
      alreadyFired = true
      if (timerId) { clearTimeout(timerId); timerId = null }

      const count = getPromptCount()
      incrementCount()
      sessionStorage.setItem(SESSION_SHOWN, '1')
      // 발동 원인 확정 — 스크롤 85%가 충족돼 있으면 정독, 아니면 60초 백스톱
      triggerRef.current = scrolledRef.current ? 'read_complete' : 'backstop'
      setVisible(true)
      gtmSignupBannerEligible(pathname)
      gtmSignupBannerShown(pathname, count + 1)
      // 노출 측정 (EventLog, _anon_sid 자동) — 발동 시점 정독률
      const scrollableNow = document.documentElement.scrollHeight - window.innerHeight
      const scrollAt = scrollableNow <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((window.scrollY / scrollableNow) * 100)))
      // EventLog에도 GA4와 동일하게 기록 — EventLog 단독 배너 퍼널 재구성 가능하게 (eligible=분모)
      //  ⚠️ app_card variant도 이 배너의 노출 1회로 계산한다(기존 횟수 정책 공유).
      trackEvent('signup_banner_eligible', { show_count: count + 1 })
      trackEvent('signup_banner_shown', { scroll_at_show: scrollAt })

      // 실험 노출 — 기존 signup_banner_* 와 **병행**. app_card는 가입 배너가 아니므로
      // signup 전용 이벤트만으로 해석하면 안 된다(그래서 별도 계열을 둔다).
      const v = variantRef.current
      if (v) {
        trackEvent(ANDROID_CONVERSION_EVENTS.exposed, {
          experiment_id: ANDROID_CONVERSION_EXPERIMENT_ID,
          variant: v,
          surface: ANDROID_CONVERSION_SURFACE,
          trigger: triggerRef.current,
          browser_env: getBrowserEnv(),
          path: pathname,
          cta_type: ANDROID_CONVERSION_CONTENT[v].ctaType,
          scroll_at_show: scrollAt,
          show_count: count + 1,
        })
      }
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

    // [PR-C1] 댓글 입력이 화면을 벗어나면 즉시 재시도한다.
    //   스크롤 핸들러는 85% 이상일 때만 tryFire를 부르므로, 위로 스크롤해 댓글창을 벗어난 경우
    //   이 구독이 없으면 배너가 영영 미뤄진다.
    const unsubscribe = subscribeCommentEntryActive((active) => {
      if (!active) tryFire()
    })

    return () => {
      if (timerId) clearTimeout(timerId)
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
      tryFireRef.current = () => {}
    }
  }, [pathname, isLoggedIn, status, isTWA, isCapacitor])

  // ── 스크롤 감지 ──
  useEffect(() => {
    if (status === 'loading') return
    if (isLoggedIn || isTWA || isCapacitor || !isActivePath(pathname)) return
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
  }, [pathname, isLoggedIn, status, isTWA, isCapacitor])

  // ── Body scroll lock ──
  // ⚠️ 인앱에서는 잠그지 않는다.
  //   배너가 뜨면 스크롤이 잠기고, 오버레이 탭은 닫기였다. 즉 사용자가 글을 계속 읽으려면
  //   **배너를 치우는 것 말고 선택지가 없었다.** 실측 shown→dismissed 중앙값 2.4초가 그 결과다.
  //   인앱은 글 읽기 도중(정독 중앙값 42%)에 배너를 만나므로 읽기를 막으면 안 된다.
  //   비인앱은 기존 동작 유지 — Android 외부 브라우저 A/B 실험 조작감을 건드리지 않기 위해서다.
  useEffect(() => {
    if (!visible) return
    if (isInappEnv(currentEnv)) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [visible, currentEnv])

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
                className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 py-2 text-center text-[15px] font-bold leading-tight break-keep text-[#191919] transition-opacity disabled:opacity-70"
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

  const inapp = isInappEnv(currentEnv)

  // Android 인앱도 사용자는 "회원가입"을 누르는 것이다.
  // 외부 브라우저 전환은 내부 구현 경로이므로 CTA 문구에 노출하지 않는다.
  const inappCtaText = '카카오로 가입하기'

  // A2 signup_warm은 문구만 갈아끼운다 — 구조·색·트리거·횟수 정책 전부 기존과 동일.
  //  (실험 대상이 아니면 기존 BANNER_CONTENT 그대로 → 비대상 사용자 회귀 0)
  //  ⚠️ 인앱 환경은 세그먼트에서 이미 빠지므로 variant와 inapp이 동시에 참일 수 없다.
  const content = variant === 'signup_warm' ? ANDROID_CONVERSION_CONTENT.signup_warm : BANNER_CONTENT
  const ctaLabel =
    variant === 'signup_warm'
      ? ANDROID_CONVERSION_CONTENT.signup_warm.cta // 이모지가 이미 문구에 포함돼 있다
      : `💛 ${isIOS ? IOS_SIGNUP_CTA : inapp ? inappCtaText : content.cta}`

  // 실험 이벤트 공통 payload — 노출/클릭/닫기가 같은 축으로 조인되게 한 곳에서 만든다
  const experimentProps = (v: AndroidConversionVariant) => ({
    experiment_id: ANDROID_CONVERSION_EXPERIMENT_ID,
    variant: v,
    surface: ANDROID_CONVERSION_SURFACE,
    trigger: triggerRef.current,
    browser_env: getBrowserEnv(),
    path: pathname,
    cta_type: ANDROID_CONVERSION_CONTENT[v].ctaType,
    // 글 식별자 — /community/{board}/{slug} · /magazine/{id} 의 마지막 조각
    content_id: pathname.split('/').filter(Boolean).pop() ?? null,
  })

  const handleDismiss = () => {
    gtmSignupBannerDismissed(pathname, getPromptCount())
    trackEvent('signup_banner_dismissed', { show_count: getPromptCount() })
    if (variant) {
      trackEvent(ANDROID_CONVERSION_EVENTS.dismissed, {
        ...experimentProps(variant),
        show_count: getPromptCount(),
      })
    }
    setVisible(false)
  }

  // ── B2 app_card: Play스토어로 이동 ──
  //  referrer에 실험+variant(medium)와 노출면(content)이 남는다 → Play Console 획득 보고서에서 분리 집계.
  //  PR #303의 "medium은 진입점을 담는다" 정책을 그대로 따른다(되돌리지 않음).
  const handleAppCardClick = () => {
    trackEvent(ANDROID_CONVERSION_EVENTS.clicked, experimentProps('app_card'))
    gtmPlayStoreClick(APP_CARD_PLAY_MEDIUM)
    // 기존 signup_banner_clicked 계열도 유지하되 cta_type으로 구분 가능하게 남긴다
    trackEvent('signup_banner_clicked', { cta_type: 'app_install', env: currentEnv })
    window.setTimeout(() => {
      window.location.href = buildPlayStoreUrl(ANDROID_CONVERSION_SURFACE, { medium: APP_CARD_PLAY_MEDIUM })
    }, 0)
  }

  const startSignupWithKakao = () => {
    gtmSignupBannerClicked(pathname, 'kakao_oauth')
    trackEvent('signup_banner_clicked', { cta_type: 'kakao_oauth', env: currentEnv })
    setIsStarting(true)
    startKakaoLogin(pathname)
  }

  const handleCTAClick = () => {
    if (variant === 'signup_warm') {
      trackEvent(ANDROID_CONVERSION_EVENTS.clicked, experimentProps('signup_warm'))
    }
    // iOS 정책: 브라우저/인앱 구분 없이 가입 CTA는 기존 카카오 OAuth 직행만 사용한다.
    // 외부 브라우저 유도, 주소 복사, Safari 붙여넣기 안내는 가입 관문을 끊으므로 금지한다.
    if (isIOS) {
      startSignupWithKakao()
      return
    }
    if (inapp) {
      // 인앱 환경: 외부브라우저로 현재 페이지 열기 + signup=1 파라미터
      gtmSignupBannerClicked(pathname, 'external_browser')
      trackEvent('signup_banner_clicked', { cta_type: 'external_browser', env: currentEnv })
      const targetUrl = new URL(window.location.href)
      targetUrl.searchParams.set('signup', '1')
      targetUrl.searchParams.set('utm_source', currentEnv)
      targetUrl.searchParams.set('utm_medium', 'signup_banner')

      // [계측] 인앱 유도 퍼널을 EventLog에도 남긴다 — 어드민은 EventLog 기반이라
      //   GTM에만 있으면 운영에서 볼 수 없다. GTM 호출은 그대로 유지(두 파이프 병행).
      const redirectProps = (method: InappRedirectMethod) =>
        buildInappRedirectProps({
          surface: 'signup_prompt_banner',
          source: currentEnv,
          browserEnv: getBrowserEnv(),
          userAgent: navigator.userAgent,
          path: pathname,
          target: redirectTargetOf(targetUrl),
          method,
          ctaType: 'external_browser',
          utmSource: currentEnv,
          utmMedium: 'signup_banner',
        })

      if (currentEnv === 'kakao-android') {
        gtmInappRedirectAttempted(currentEnv, 'intent')
        trackEvent(INAPP_REDIRECT_EVENTS.attempted, redirectProps('intent'))
        navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})
        const host = targetUrl.hostname + targetUrl.pathname + targetUrl.search
        location.href = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`
      } else {
        // naver-inapp, google-inapp: Android intent만 유지한다. iOS는 위에서 카카오 OAuth 직행.
        if (/android/i.test(navigator.userAgent)) {
          gtmInappRedirectAttempted(currentEnv, 'intent')
          trackEvent(INAPP_REDIRECT_EVENTS.attempted, redirectProps('intent'))
          navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})
          const host = targetUrl.hostname + targetUrl.pathname + targetUrl.search
          location.href = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`
        }
      }
    } else {
      startSignupWithKakao()
    }
  }

  // ── B2 app_card (Android 외부 브라우저 비회원 전용) ──
  //  "설치"가 아니라 "다음에 바로 들어오기". 앱 아이콘은 실제 자산(/logo-symbol.png)을 쓰고,
  //  별점·설치수·스토어 배지 같은 광고 문법과 "무료/지금/다운로드" 같은 낚시 문구는 넣지 않는다.
  if (variant === 'app_card') {
    const c = ANDROID_CONVERSION_CONTENT.app_card
    return (
      <>
        <div
          className="fixed inset-0 z-[149] bg-black/50 animate-in fade-in duration-300"
          onClick={handleDismiss}
          aria-hidden="true"
        />
        <div
          data-testid="android-conversion-app-card"
          className="fixed bottom-0 left-0 right-0 z-[150] animate-in slide-in-from-bottom duration-300"
        >
          <div className="bg-card border-t border-border shadow-2xl px-4 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="max-w-lg mx-auto">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-body leading-snug text-foreground">{c.headline}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 break-keep">{c.sub}</p>
                </div>
                {/* 닫기 버튼: 44×44px */}
                <button
                  onClick={handleDismiss}
                  className="shrink-0 w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              {/* 앱 카드 — 홈 화면 아이콘 은유. 코랄은 아주 옅게(진한 블록은 광고로 읽힌다) */}
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[13px] border border-primary/20 bg-white">
                  <Image src="/logo-symbol.png" alt="" width={52} height={52} className="h-full w-full object-contain" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-tight text-foreground">{c.appName}</span>
                  <span className="mt-0.5 block break-keep text-xs text-muted-foreground">{c.appNote}</span>
                </span>
              </div>

              <button
                data-testid="android-conversion-app-cta"
                onClick={handleAppCardClick}
                className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-center text-[15px] font-bold leading-tight break-keep text-white transition-opacity hover:opacity-90"
              >
                {c.cta}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/*
        딤 오버레이 — **인앱에서는 탭으로 닫지 않는다.**

        인앱 사용자는 글을 읽던 중 배너를 만난다. 오버레이 탭이 곧 닫기이면,
        "계속 읽으려고 화면을 한 번 누른 것"이 그대로 dismiss가 된다.
        실측(2026-08-09): 인앱 shown→dismissed 중앙값 2.4초, 3초 이내 닫힘 63.2%,
        인앱 닫힘률 77.6% vs 데스크탑 35.2%(마우스라 화면을 탭할 일이 없다).
        닫기는 ✕ 버튼(44×44px)으로만 하고, 스크롤은 지금처럼 그대로 가능하다.

        ⚠️ 인앱이 아닌 환경은 기존 동작을 그대로 유지한다 — Android 외부 브라우저 A/B 실험
        (android_conversion_a2_b2)의 UI·조작을 건드리지 않기 위해서다.
      */}
      <div
        className="fixed inset-0 z-[149] bg-black/50 animate-in fade-in duration-300"
        onClick={inapp ? undefined : handleDismiss}
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
                <p className="text-sm text-muted-foreground mt-0.5 break-keep">
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
            {/*
              iOS는 인앱 여부와 관계없이 기존 카카오 OAuth 직행이다.
              Android 인앱만 외부 브라우저 유도 문구를 유지한다.
            */}
            <button
              data-testid="signup-banner-cta"
              onClick={handleCTAClick}
              disabled={isStarting}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#FEE500] px-4 py-2 text-center text-[15px] font-bold leading-tight break-keep text-[#191919] transition-opacity disabled:opacity-70"
            >
              {isStarting ? '카카오로 이동 중...' : ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
