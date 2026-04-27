'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { gtmPwaPopupShown, gtmPwaInstall, gtmPwaBannerAction } from '@/lib/gtm'
import { useToast } from '@/components/common/Toast'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Trigger = 'first_15s' | 'signup' | 'engagement' | 'weekly'

type Env =
  | 'android-chrome'   // beforeinstallprompt 가능
  | 'ios-safari'       // 수동 3단계 안내
  | 'kakao-android'    // 카카오 Android 인앱 → Chrome 유도 배너
  | 'kakao-ios'        // 카카오 iOS 인앱 → Safari 유도 배너
  | 'naver-inapp'      // 설치 불가 → 팝업/버튼 숨김
  | 'google-inapp'     // Google 앱(GSA/) 인앱 → 설치 불가, 외부브라우저 유도
  | 'crios'            // iOS Chrome — 설치 불가
  | 'instagram-inapp'  // 설치 불가
  | 'desktop'          // 모바일 전용
  | 'other'            // Samsung Internet 등 (beforeinstallprompt 대기)

const BLOCKED_ENVS: Env[] = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop']
const ANDROID_ENVS: Env[] = ['android-chrome', 'other']  // Chrome + Samsung Internet

export function detectEnv(): Env {
  if (typeof window === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (window.innerWidth >= 1024) return 'desktop'
  if (/KAKAOTALK/i.test(ua)) return /android/i.test(ua) ? 'kakao-android' : 'kakao-ios'
  if (/NAVER\(inapp|NaverSearchApp/i.test(ua)) return 'naver-inapp'
  if (/Instagram|FBAN|FBAV/i.test(ua)) return 'instagram-inapp'
  if (/\bGSA\//i.test(ua)) return 'google-inapp'  // Google Search App 인앱브라우저
  if (/CriOS/i.test(ua)) return 'crios'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios-safari'
  return 'android-chrome'
}

const KEY_SHOWN         = 'pwa_shown_triggers'       // JSON Trigger[]
const KEY_COUNT         = 'pwa_declined_count'        // number (최대 3회 — weekly 이후 정지)
const KEY_INSTALLED     = 'pwa_installed'             // '1'
const KEY_LAST_PROMPTED = 'pwa_last_prompted_at'      // ISO timestamp
const KEY_SESSION_COUNT = 'pwa_session_count'         // number (세션 횟수)
const KEY_SHOWN_COUNT   = 'pwa_shown_count'           // number (총 노출 횟수)

const KEY_KAKAO_GUIDE_AT       = 'pwa_kakao_guide_at'       // 3일 쿨다운 timestamp
const KEY_NAVER_GUIDE_AT       = 'pwa_naver_guide_at'       // 3일 쿨다운 timestamp
const KEY_INSTAGRAM_GUIDE_AT   = 'pwa_instagram_guide_at'   // 3일 쿨다운 timestamp
const KAKAO_GUIDE_COOLDOWN_MS  = 3 * 24 * 60 * 60 * 1000

// Phase 3: 가입 완료 후 페이지 탐색 카운터
const KEY_PAGE_VIEWS_AFTER_SIGNUP  = 'pwa_page_views_after_signup'
const PAGE_VIEW_TRIGGER_THRESHOLD  = 3

// sessionStorage (탭 닫으면 리셋)
const SESSION_VISITED       = 'pwa_visited_this_session'        // 세션 카운트 중복 방지
const SESSION_SHOWN         = 'pwa_shown_this_session'          // 세션 내 팝업 1회 노출 제한
const SESSION_PENDING       = 'pwa_pending'                     // OnboardingForm → 마운트 후 처리
const SESSION_BANNER_SHOWN  = 'pwa_banner_shown_this_session'   // 세션 내 배너 1회 노출 제한

// 타이머 미동작 페이지 (가입 플로우 방해 방지)
const EXCLUDED_PATHS = ['/login', '/signup', '/onboarding']

const WEEKLY_MS    = 7 * 24 * 60 * 60 * 1000
const MAX_DECLINES = 3
const TIMER_MS     = 13_000

interface PwaStatus {
  installed: boolean
  popupShownCount: number
  bannerDismissCount: number
  bannerLastDismissAt: string | null
  bannerHiddenUntil: string | null
}

function getInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    localStorage.getItem(KEY_INSTALLED) === '1'
  )
}

function getShown(): Trigger[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY_SHOWN) ?? '[]') } catch { return [] }
}

function getShownCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(KEY_SHOWN_COUNT) ?? '0')
}

function getDeclineCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(KEY_COUNT) ?? '0')
}

function markShown(t: Trigger) {
  if (typeof window === 'undefined') return
  const s = getShown()
  if (!s.includes(t)) {
    localStorage.setItem(KEY_SHOWN, JSON.stringify([...s, t]))
    localStorage.setItem(KEY_SHOWN_COUNT, String(getShownCount() + 1))
  }
}

function incrementSessionCount(): number {
  if (typeof window === 'undefined') return 0
  if (sessionStorage.getItem(SESSION_VISITED)) {
    return parseInt(localStorage.getItem(KEY_SESSION_COUNT) ?? '0')
  }
  sessionStorage.setItem(SESSION_VISITED, '1')
  const count = parseInt(localStorage.getItem(KEY_SESSION_COUNT) ?? '0') + 1
  localStorage.setItem(KEY_SESSION_COUNT, String(count))
  return count
}

function canShow(t: Trigger, dbShownCount?: number): boolean {
  if (typeof window === 'undefined') return false
  if (getInstalled()) return false
  if (sessionStorage.getItem(SESSION_SHOWN)) return false  // 세션 내 1회 제한
  if (sessionStorage.getItem('signup_prompt_shown_this_session')) return false  // 가입 유도 배너 노출 시 충돌 방지

  const shown = getShown()
  // 로그인 유저: DB 카운트와 localStorage 중 큰 값 사용 (localStorage 삭제 우회 방지)
  const shownCount = Math.max(getShownCount(), dbShownCount ?? 0)

  // 1번: 최초 방문, 아직 한 번도 안 뜬 경우에만
  if (t === 'first_15s')
    return shownCount === 0 && !shown.includes('first_15s')

  // 2번: 회원가입 완료 직후 — 1번 실패(미설치) 시 발동 가능. 1번 성공 시 getInstalled()=true → 자동 차단
  if (t === 'signup')
    return shownCount < 2 && !shown.includes('signup')

  // 3번: 첫 글/댓글 완료 — 1·2번 모두 실패(미설치) 상태여야 조건 충족 가능
  if (t === 'engagement')
    return shownCount < 3 && !shown.includes('engagement')

  // 4번: 1·2·3번 모두 실패 후 7일 경과 시 반복 (설치됐으면 getInstalled()로 차단)
  if (t === 'weekly') {
    if (getDeclineCount() >= MAX_DECLINES) return false
    if (shownCount < 2) return false
    const last = localStorage.getItem(KEY_LAST_PROMPTED)
    if (!last) return true
    return Date.now() - new Date(last).getTime() >= WEEKLY_MS
  }
  return false
}

// 팝업 노출 시 DB에 기록 (fire-and-forget)
function postPopupShown() {
  fetch('/api/user/pwa-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'popup_shown' }),
  }).catch(() => {})
}

export default function AddToHomeScreen() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [visible, setVisible] = useState(false)
  const [isManual, setIsManual] = useState(false)
  const [canNativeInstall, setCanNativeInstall] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)
  const [pwaStatus, setPwaStatus] = useState<PwaStatus | null>(null)
  const [kakaoGuideVisible, setKakaoGuideVisible] = useState(false)
  const [naverGuideVisible, setNaverGuideVisible] = useState(false)
  const [instagramGuideVisible, setInstagramGuideVisible] = useState(false)
  const { toast: showToast } = useToast()
  const envRef          = useRef<Env>('other')
  const deferredRef     = useRef<BeforeInstallPromptEvent | null>(null)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTriggerRef = useRef<string>('first_15s')
  const lastCountedPathRef = useRef<string | null>(null)  // Phase 3: 같은 pathname 이중 카운트 방지

  async function markInstalled() {
    localStorage.setItem(KEY_INSTALLED, '1')
    try {
      await fetch('/api/user/pwa-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'installed' }),
      })
    } catch { /* ignore */ }
  }

  const handleKakaoGuide = () => {
    localStorage.setItem(KEY_KAKAO_GUIDE_AT, String(Date.now()))
    setKakaoGuideVisible(false)

    const targetUrl = new URL(window.location.href)
    targetUrl.searchParams.set('utm_source', 'kakao_inapp')
    targetUrl.searchParams.set('utm_medium', 'pwa_banner')

    // 클립보드 복사 (Android intent 실패 시 폴백 보장)
    navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})

    if (envRef.current === 'kakao-android') {
      const host = targetUrl.hostname + targetUrl.pathname + targetUrl.search
      location.href = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`
    } else {
      // iOS: intent 불가 → 복사 완료 안내
      showToast('주소가 복사됐어요. Safari 주소창에 붙여넣으세요')
    }
  }

  const handleKakaoGuideDismiss = () => {
    localStorage.setItem(KEY_KAKAO_GUIDE_AT, String(Date.now()))
    setKakaoGuideVisible(false)
  }

  const handleInappGuide = (env: 'naver-inapp' | 'instagram-inapp') => {
    const key = env === 'naver-inapp' ? KEY_NAVER_GUIDE_AT : KEY_INSTAGRAM_GUIDE_AT
    localStorage.setItem(key, String(Date.now()))
    if (env === 'naver-inapp') setNaverGuideVisible(false)
    else setInstagramGuideVisible(false)

    const targetUrl = new URL(window.location.href)
    targetUrl.searchParams.set('utm_source', env === 'naver-inapp' ? 'naver_inapp' : 'instagram_inapp')
    targetUrl.searchParams.set('utm_medium', 'pwa_banner')

    navigator.clipboard?.writeText(targetUrl.toString())?.catch(() => {})

    if (/android/i.test(navigator.userAgent)) {
      const host = targetUrl.hostname + targetUrl.pathname + targetUrl.search
      location.href = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`
    } else {
      // iOS: intent 불가 → 복사 완료 안내
      showToast('주소가 복사됐어요. Safari 주소창에 붙여넣으세요')
    }
  }

  const handleInappGuideDismiss = (env: 'naver-inapp' | 'instagram-inapp') => {
    const key = env === 'naver-inapp' ? KEY_NAVER_GUIDE_AT : KEY_INSTAGRAM_GUIDE_AT
    localStorage.setItem(key, String(Date.now()))
    if (env === 'naver-inapp') setNaverGuideVisible(false)
    else setInstagramGuideVisible(false)
  }

  const showTrigger = useCallback((t: Trigger, dbShownCount?: number): boolean => {
    if (canShow(t, dbShownCount)) {
      markShown(t)
      localStorage.setItem(KEY_LAST_PROMPTED, new Date().toISOString())
      sessionStorage.setItem(SESSION_SHOWN, '1')
      currentTriggerRef.current = t
      setIsManual(false)
      setVisible(true)
      postPopupShown()
      gtmPwaPopupShown(t, envRef.current)
      return true
    }
    return false
  }, [])

  // 마운트: 환경 감지 + 설치 상태 확인 + 세션 카운트 증가 + 이벤트 등록
  useEffect(() => {
    const env = detectEnv()
    envRef.current = env

    // 카카오 인앱: PWA 설치 불가 → 외부 브라우저 유도 배너 (3일 쿨다운)
    if (env === 'kakao-android' || env === 'kakao-ios') {
      const last = localStorage.getItem(KEY_KAKAO_GUIDE_AT)
      const expired = !last || Date.now() - Number(last) > KAKAO_GUIDE_COOLDOWN_MS
      if (expired) setKakaoGuideVisible(true)
      return
    }

    // 네이버/인스타그램 인앱: 동일하게 외부 브라우저 유도 배너 (3일 쿨다운)
    if (env === 'naver-inapp') {
      const last = localStorage.getItem(KEY_NAVER_GUIDE_AT)
      const expired = !last || Date.now() - Number(last) > KAKAO_GUIDE_COOLDOWN_MS
      if (expired) setNaverGuideVisible(true)
      return
    }
    if (env === 'instagram-inapp') {
      const last = localStorage.getItem(KEY_INSTAGRAM_GUIDE_AT)
      const expired = !last || Date.now() - Number(last) > KAKAO_GUIDE_COOLDOWN_MS
      if (expired) setInstagramGuideVisible(true)
      return
    }

    if (BLOCKED_ENVS.includes(env)) return

    incrementSessionCount()

    if (getInstalled()) localStorage.setItem(KEY_INSTALLED, '1')

    // DB 상태 로드 (로그인 유저: popupShownCount로 localStorage 리셋 우회 방지)
    fetch('/api/user/pwa-status')
      .then(r => (r.ok ? r.json() : null))
      .then((data: PwaStatus | null) => {
        if (!data) return
        setPwaStatus(data)
        if (data.installed) localStorage.setItem(KEY_INSTALLED, '1')
        // localStorage 카운트가 DB보다 낮으면 동기화
        if (data.popupShownCount > getShownCount()) {
          localStorage.setItem(KEY_SHOWN_COUNT, String(data.popupShownCount))
        }
      })
      .catch(() => {})

    // OnboardingForm에서 저장한 pending 트리거 처리
    const pending = sessionStorage.getItem(SESSION_PENDING)
    if (pending === 'signup') {
      sessionStorage.removeItem(SESSION_PENDING)
      // pwa_pending deprecated — 페이지 카운터(pathname effect)가 signup 트리거 처리
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setCanNativeInstall(true)
    }

    const onPWAPrompt = (e: Event) => {
      const trigger = (e as CustomEvent<Trigger | 'manual'>).detail
      const native  = deferredRef.current !== null && env !== 'ios-safari'

      if (trigger === 'manual') {
        setCanNativeInstall(native)
        currentTriggerRef.current = 'manual'
        setIsManual(true)
        setVisible(true)
        return
      }

      setCanNativeInstall(native)
      showTrigger(trigger as Trigger)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('pwa-prompt', onPWAPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('pwa-prompt', onPWAPrompt)
    }
  }, [showTrigger])

  // 페이지 변경 시: 제외 페이지가 아니면 13초 타이머 시작 + 가입 후 페이지 카운터
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const isExcluded = EXCLUDED_PATHS.some(p => pathname.startsWith(p))
    if (!isExcluded) {
      timerRef.current = setTimeout(() => {
        const dbCount = pwaStatus?.popupShownCount
        if (showTrigger('first_15s', dbCount)) return
        showTrigger('weekly', dbCount)
      }, TIMER_MS)

      // ── Phase 3: 가입 완료 후 3페이지 탐색 시 PWA 팝업 트리거 ──
      // lastCountedPathRef: pwaStatus 변경으로 useEffect 재실행 시 같은 pathname 이중 카운트 방지
      const signupCompletedAt = localStorage.getItem('signup_completed_at')
      if (
        signupCompletedAt &&
        !getInstalled() &&
        !sessionStorage.getItem(SESSION_SHOWN) &&
        lastCountedPathRef.current !== pathname
      ) {
        lastCountedPathRef.current = pathname
        const views = parseInt(localStorage.getItem(KEY_PAGE_VIEWS_AFTER_SIGNUP) ?? '0', 10)
        const newViews = views + 1
        localStorage.setItem(KEY_PAGE_VIEWS_AFTER_SIGNUP, String(Math.min(newViews, 20)))
        if (newViews >= PAGE_VIEW_TRIGGER_THRESHOLD) {
          showTrigger('signup')
        }
      }
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [pathname, showTrigger, pwaStatus])

  // 배너 표시 조건 판단
  // canNativeInstall 변경 시 재평가 (beforeinstallprompt는 비동기 도착)
  useEffect(() => {
    if (!pwaStatus) return
    const env = envRef.current

    // 조건 1: 로그인 상태
    if (!session?.user?.id) return
    // 조건 2: Android Chrome 또는 Samsung Internet
    if (!ANDROID_ENVS.includes(env)) return
    // 조건 3: beforeinstallprompt 캡처됨 (canNativeInstall = true 시점 이후 실행)
    if (!canNativeInstall) return
    // 조건 4: 미설치
    if (getInstalled()) return
    // 조건 5: 팝업 최소 1회 경험
    if (pwaStatus.popupShownCount < 1) return
    // 조건 6: 배너 숨김 기간 만료
    if (pwaStatus.bannerHiddenUntil) {
      if (new Date(pwaStatus.bannerHiddenUntil) > new Date()) return
    }
    // 조건 7: 제외 경로 아님
    if (EXCLUDED_PATHS.some(p => pathname.startsWith(p))) return
    // 조건 8: 이 세션에서 배너 아직 안 보임
    if (sessionStorage.getItem(SESSION_BANNER_SHOWN)) return

    sessionStorage.setItem(SESSION_BANNER_SHOWN, '1')
    setBannerVisible(true)
    gtmPwaBannerAction('shown')
  }, [pwaStatus, session, pathname, canNativeInstall])

  const handleInstall = async () => {
    if (deferredRef.current) {
      await deferredRef.current.prompt()
      const { outcome } = await deferredRef.current.userChoice
      deferredRef.current = null
      setCanNativeInstall(false)
      gtmPwaInstall(currentTriggerRef.current, envRef.current, outcome)
      if (outcome === 'accepted') await markInstalled()
    }
    setVisible(false)
    setIsManual(false)
  }

  const handleBannerInstall = async () => {
    if (deferredRef.current) {
      await deferredRef.current.prompt()
      const { outcome } = await deferredRef.current.userChoice
      deferredRef.current = null
      if (outcome === 'accepted') await markInstalled()
    }
    gtmPwaBannerAction('install')
    setBannerVisible(false)
  }

  const handleDismiss = () => {
    if (!isManual) {
      localStorage.setItem(KEY_COUNT, String(getDeclineCount() + 1))
      gtmPwaInstall(currentTriggerRef.current, envRef.current, 'dismissed')
    }
    setVisible(false)
    setIsManual(false)
  }

  const handleBannerDismiss = () => {
    gtmPwaBannerAction('dismissed')
    setBannerVisible(false)
    fetch('/api/user/pwa-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'banner_dismissed' }),
    }).catch(() => {})
  }

  // iOS Safari: 팝업 안에서 수동 3단계 안내 (기존 유지)
  const isIos = envRef.current === 'ios-safari'
  // Chrome/Samsung: beforeinstallprompt 없으면 팝업 표시 불필요
  const showPopup = visible && (isIos || canNativeInstall || isManual)

  return (
    <>
      {/* ── 카카오 인앱 외부 브라우저 유도 배너 ── */}
      {kakaoGuideVisible && (
        <div className="fixed bottom-0 left-0 right-0 z-[300] bg-card border-t border-border shadow-lg px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[15px] font-bold text-foreground">앱처럼 편하게 쓰려면</p>
            <button
              onClick={handleKakaoGuideDismiss}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground"
              aria-label="닫기"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <p className="text-caption text-muted-foreground mb-3 break-keep">
            {envRef.current === 'kakao-android'
              ? 'Chrome 앱에서 열면 홈 화면에 추가할 수 있어요'
              : 'Safari에서 열면 홈 화면에 추가할 수 있어요'}
          </p>
          <button
            onClick={handleKakaoGuide}
            className="w-full h-[52px] bg-primary text-white rounded-xl font-bold text-[16px]"
          >
            {envRef.current === 'kakao-android' ? '크롬으로 열기' : '주소 복사하기'}
          </button>
          <p className="text-center text-caption text-muted-foreground mt-2">
            {envRef.current === 'kakao-android'
              ? '주소도 자동으로 복사돼요'
              : '복사 후 Safari 주소창에 붙여넣으세요'}
          </p>
        </div>
      )}

      {/* ── 네이버 인앱 외부 브라우저 유도 배너 ── */}
      {naverGuideVisible && (
        <div className="fixed bottom-0 left-0 right-0 z-[300] bg-card border-t border-border shadow-lg px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[15px] font-bold text-foreground">앱처럼 편하게 쓰려면</p>
            <button
              onClick={() => handleInappGuideDismiss('naver-inapp')}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground"
              aria-label="닫기"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <p className="text-caption text-muted-foreground mb-3 break-keep">
            {/android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              ? 'Chrome 앱에서 열면 홈 화면에 추가할 수 있어요'
              : 'Safari에서 열면 홈 화면에 추가할 수 있어요'}
          </p>
          <button
            onClick={() => handleInappGuide('naver-inapp')}
            className="w-full h-[52px] bg-primary text-white rounded-xl font-bold text-[16px]"
          >
            {/android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              ? '크롬으로 열기'
              : '주소 복사하기'}
          </button>
          <p className="text-center text-caption text-muted-foreground mt-2">
            {/android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              ? '주소도 자동으로 복사돼요'
              : '복사 후 Safari 주소창에 붙여넣으세요'}
          </p>
        </div>
      )}

      {/* ── 인스타그램 인앱 외부 브라우저 유도 배너 ── */}
      {instagramGuideVisible && (
        <div className="fixed bottom-0 left-0 right-0 z-[300] bg-card border-t border-border shadow-lg px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[15px] font-bold text-foreground">앱처럼 편하게 쓰려면</p>
            <button
              onClick={() => handleInappGuideDismiss('instagram-inapp')}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground"
              aria-label="닫기"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <p className="text-caption text-muted-foreground mb-3 break-keep">
            {/android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              ? 'Chrome 앱에서 열면 홈 화면에 추가할 수 있어요'
              : 'Safari에서 열면 홈 화면에 추가할 수 있어요'}
          </p>
          <button
            onClick={() => handleInappGuide('instagram-inapp')}
            className="w-full h-[52px] bg-primary text-white rounded-xl font-bold text-[16px]"
          >
            {/android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              ? '크롬으로 열기'
              : '주소 복사하기'}
          </button>
          <p className="text-center text-caption text-muted-foreground mt-2">
            {/android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              ? '주소도 자동으로 복사돼요'
              : '복사 후 Safari 주소창에 붙여넣으세요'}
          </p>
        </div>
      )}

      {/* ── 팝업 ── */}
      {showPopup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4">
          {/* 딤 배경 */}
          <div className="absolute inset-0 bg-black/50" onClick={handleDismiss} />

          {/* 모달 카드 */}
          <div
            className="relative w-full max-w-sm bg-card rounded-2xl p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground"
              aria-label="닫기"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M14 4L4 14M4 4L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {/* 로고 */}
            <div className="flex justify-center mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-symbol.png"
                alt="우나어"
                className="w-14 h-14 object-contain"
              />
            </div>

            {isIos ? (
              /* iOS Safari: 수동 3단계 안내 (기존 유지) */
              <>
                <p className="font-bold text-foreground text-[20px] leading-snug text-center mb-1">
                  홈 화면에 추가하세요
                </p>
                <p className="text-sm text-muted-foreground text-center mb-5 break-keep">
                  앱 설치와 달라요 — 버튼 하나
                </p>
                <div className="bg-muted/60 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                    <span>하단 <strong>공유 버튼</strong>을 탭하세요</span>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 ml-auto text-primary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
                    </svg>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                    <span><strong>홈 화면에 추가</strong>를 선택하세요</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                    <span>오른쪽 상단 <strong>추가</strong>를 탭하세요</span>
                  </div>
                </div>
              </>
            ) : (
              /* Android Chrome / Samsung Internet */
              <>
                {/* 헤드카피 */}
                <div className="text-center mb-1">
                  <p className="text-[20px] font-bold text-foreground leading-snug break-keep">
                    우리 또래 이야기,<br />
                    언제든 꺼낼 수 있게
                  </p>
                </div>

                {/* 구분선 */}
                <div className="border-t border-primary/20 my-4" />

                {/* 슬로건 */}
                <p className="text-center text-[17px] font-bold text-primary mb-5 break-keep">
                  우리 — 서로를 잇다
                </p>

                {/* 혜택 3줄 */}
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2 text-[15px] text-foreground">
                    <span className="text-primary font-bold flex-shrink-0">✓</span>
                    혼자 답답할 때, 우리 또래 바로
                  </li>
                  <li className="flex items-center gap-2 text-[15px] text-foreground">
                    <span className="text-primary font-bold flex-shrink-0">✓</span>
                    나만의 이야기 편하게 나눠요
                  </li>
                  <li className="flex items-center gap-2 text-[15px] text-foreground">
                    <span className="text-primary font-bold flex-shrink-0">✓</span>
                    검색 없이 홈에서 바로 열려요
                  </li>
                </ul>

                {/* 설치 버튼 */}
                <button
                  onClick={handleInstall}
                  className="w-full h-[56px] bg-primary text-white rounded-xl font-bold text-[18px] flex items-center justify-center gap-2"
                >
                  <span>📱</span> 무료로 다운받기
                </button>
              </>
            )}

            <button
              onClick={handleDismiss}
              className="mt-3 w-full h-[44px] text-[11px] text-muted-foreground"
            >
              나중에 할게요
            </button>
          </div>
        </div>
      )}

      {/* ── 하단 배너 (로그인 유저 + popup 1회 이상 경험) — 안 C: FREE ── */}
      {bannerVisible && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] w-full bg-card border-t border-border shadow-lg">
          {/* dismiss 행 */}
          <div className="flex items-center justify-between px-4 pt-2">
            <button
              onClick={handleBannerDismiss}
              className="text-xs text-muted-foreground min-h-[44px] flex items-center"
            >
              하루 안보기
            </button>
            <button
              onClick={handleBannerDismiss}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground"
              aria-label="배너 닫기"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* 배너 본체 */}
          <div className="h-[56px] flex items-center gap-3 px-4 pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="우나어"
              className="w-6 h-6 rounded-md object-contain bg-white flex-shrink-0"
            />
            <p className="flex-1 text-[15px] font-medium text-foreground leading-tight break-keep">
              앱처럼 쓰는데 완전 무료예요
            </p>
            <button
              onClick={handleBannerInstall}
              className="h-[40px] px-4 bg-primary text-white rounded-lg text-sm font-bold shrink-0 whitespace-nowrap"
            >
              무료 받기
            </button>
          </div>
        </div>
      )}
    </>
  )
}
