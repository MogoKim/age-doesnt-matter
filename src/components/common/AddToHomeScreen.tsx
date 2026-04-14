'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Trigger = 'first_15s' | 'signup' | 'engagement' | 'return_session' | 'weekly'

type Env =
  | 'android-chrome'   // beforeinstallprompt 가능
  | 'ios-safari'       // 수동 3단계 안내
  | 'kakao-inapp'      // 설치 불가 → 팝업/버튼 숨김
  | 'naver-inapp'      // 설치 불가 → 팝업/버튼 숨김
  | 'crios'            // iOS Chrome — 설치 불가
  | 'instagram-inapp'  // 설치 불가
  | 'desktop'          // 모바일 전용
  | 'other'            // Samsung Internet 등 (beforeinstallprompt 대기)

const BLOCKED_ENVS: Env[] = ['kakao-inapp', 'naver-inapp', 'instagram-inapp', 'crios', 'desktop']

export function detectEnv(): Env {
  if (typeof window === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (window.innerWidth >= 1024) return 'desktop'
  if (/KAKAOTALK/i.test(ua)) return 'kakao-inapp'
  if (/NAVER\(inapp|NaverSearchApp/i.test(ua)) return 'naver-inapp'
  if (/Instagram|FBAN|FBAV/i.test(ua)) return 'instagram-inapp'
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

// sessionStorage (탭 닫으면 리셋)
const SESSION_VISITED = 'pwa_visited_this_session'    // 세션 카운트 중복 방지
const SESSION_SHOWN   = 'pwa_shown_this_session'      // 세션 내 1회 노출 제한
const SESSION_PENDING = 'pwa_pending'                 // OnboardingForm → 마운트 후 처리

// 타이머 미동작 페이지 (가입 플로우 방해 방지)
const EXCLUDED_PATHS = ['/login', '/signup', '/onboarding']

const WEEKLY_MS   = 7 * 24 * 60 * 60 * 1000
const MAX_DECLINES = 3
const TIMER_MS    = 13_000

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

function getSessionCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(KEY_SESSION_COUNT) ?? '0')
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
  // 새로고침 = 동일 세션 (중복 카운트 방지)
  if (sessionStorage.getItem(SESSION_VISITED)) {
    return getSessionCount()
  }
  sessionStorage.setItem(SESSION_VISITED, '1')
  const count = getSessionCount() + 1
  localStorage.setItem(KEY_SESSION_COUNT, String(count))
  return count
}

function canShow(t: Trigger): boolean {
  if (typeof window === 'undefined') return false
  if (getInstalled()) return false
  if (sessionStorage.getItem(SESSION_SHOWN)) return false  // 세션 내 1회 제한

  const shown     = getShown()
  const shownCount = getShownCount()

  // 1번: 첫 노출 (아직 한 번도 안 뜬 경우에만)
  if (t === 'first_15s')
    return shownCount === 0 && !shown.includes('first_15s')

  // 2번: 회원가입 완료 직후 — 앞 트리거 무관, 노출횟수 기반 독립 조건
  // (첫 방문 즉시 가입 케이스 대응: first_15s 미발동이어도 OK)
  if (t === 'signup')
    return shownCount < 2 && !shown.includes('signup')

  // 3번: 첫 글/댓글 완료 — 독립 조건
  // (기존 회원은 signup 없이 여기 도달 가능)
  if (t === 'engagement')
    return shownCount < 3 && !shown.includes('engagement')

  // 4번: 2번째+ 세션 진입, 이미 1회 이상 노출됨
  // (비로그인/글 미작성 유저도 자연스럽게 진행)
  if (t === 'return_session')
    return getSessionCount() >= 2 && shownCount >= 1 && !shown.includes('return_session')

  // 5번: 2회 이상 노출 후 7일마다 반복 (3회 거절 시 중단)
  if (t === 'weekly') {
    if (getDeclineCount() >= MAX_DECLINES) return false
    if (shownCount < 2) return false
    const last = localStorage.getItem(KEY_LAST_PROMPTED)
    if (!last) return true
    return Date.now() - new Date(last).getTime() >= WEEKLY_MS
  }
  return false
}

export default function AddToHomeScreen() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [isManual, setIsManual] = useState(false)
  const [canNativeInstall, setCanNativeInstall] = useState(false)
  const envRef = useRef<Env>('other')
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function markInstalled() {
    localStorage.setItem(KEY_INSTALLED, '1')
    try {
      await fetch('/api/user/pwa-status', { method: 'POST' })
    } catch { /* ignore */ }
  }

  const showTrigger = useCallback((t: Trigger): boolean => {
    if (canShow(t)) {
      markShown(t)
      localStorage.setItem(KEY_LAST_PROMPTED, new Date().toISOString())
      sessionStorage.setItem(SESSION_SHOWN, '1')  // 이 세션은 이미 뜸
      setIsManual(false)
      setVisible(true)
      return true
    }
    return false
  }, [])

  // 마운트: 채널 감지 + 설치 상태 확인 + 세션 카운트 증가 + 이벤트 등록
  useEffect(() => {
    const env = detectEnv()
    envRef.current = env

    // 설치 불가 채널 → 자동 팝업 완전 차단 (이벤트 리스너도 불필요)
    if (BLOCKED_ENVS.includes(env)) return

    incrementSessionCount()

    if (getInstalled()) localStorage.setItem(KEY_INSTALLED, '1')

    // 로그인 유저 DB 상태 확인 (graceful fallback)
    fetch('/api/user/pwa-status')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.installed) localStorage.setItem(KEY_INSTALLED, '1') })
      .catch(() => {})

    // OnboardingForm에서 router.push('/') 직전에 저장한 pending 트리거 처리
    const pending = sessionStorage.getItem(SESSION_PENDING)
    if (pending === 'signup') {
      sessionStorage.removeItem(SESSION_PENDING)
      setTimeout(() => showTrigger('signup'), 300)
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
        // Footer 버튼: 설치 상태/거절 횟수 무관하게 무조건 표시
        setCanNativeInstall(native)
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

  // 페이지 변경 시: 제외 페이지가 아니면 13초 타이머 시작
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const isExcluded = EXCLUDED_PATHS.some(p => pathname.startsWith(p))
    if (!isExcluded) {
      timerRef.current = setTimeout(() => {
        if (showTrigger('first_15s')) return
        if (showTrigger('return_session')) return
        showTrigger('weekly')
      }, TIMER_MS)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [pathname, showTrigger])

  const handleInstall = async () => {
    if (deferredRef.current) {
      await deferredRef.current.prompt()
      const { outcome } = await deferredRef.current.userChoice
      deferredRef.current = null   // 반드시 초기화 (중복 호출 방지)
      setCanNativeInstall(false)
      if (outcome === 'accepted') await markInstalled()
    }
    setVisible(false)
    setIsManual(false)
  }

  const handleDismiss = () => {
    // manual 트리거로 열렸을 때는 거절 카운트 미증가 (의도적 접근)
    if (!isManual) {
      localStorage.setItem(KEY_COUNT, String(getDeclineCount() + 1))
    }
    setVisible(false)
    setIsManual(false)
  }

  if (!visible) return null

  // iOS Safari이거나 beforeinstallprompt 미발생 → 수동 안내 표시
  const showManualGuide = envRef.current === 'ios-safari' || !canNativeInstall

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-4">
      {/* 딤 배경 — 클릭 시 거절 처리 */}
      <div className="absolute inset-0 bg-black/50" onClick={handleDismiss} />

      {/* 모달 카드 */}
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="우나어"
            className="w-14 h-14 rounded-2xl flex-shrink-0 object-contain bg-white"
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-[18px] leading-snug">홈 화면에 추가하세요</p>
            <p className="text-sm text-muted-foreground mt-1 break-keep leading-relaxed">
              답답할 때, 이야기 나누고 싶을 때 — 딱 한 번 탭으로
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-muted-foreground flex-shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M14 4L4 14M4 4L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {showManualGuide ? (
          /* iOS 또는 beforeinstallprompt 미발생: 수동 3단계 안내 */
          <div className="mt-5 bg-muted/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              {envRef.current === 'ios-safari' ? (
                <>
                  <span>하단 <strong>공유 버튼</strong>을 탭하세요</span>
                  <svg viewBox="0 0 24 24" className="w-5 h-5 ml-auto text-primary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
                  </svg>
                </>
              ) : (
                <span>브라우저 메뉴 <strong>⋮</strong> 를 탭하세요</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <span><strong>홈 화면에 추가</strong>를 선택하세요</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <span>오른쪽 상단 <strong>추가</strong>를 탭하세요</span>
            </div>
          </div>
        ) : (
          /* Android Chrome: beforeinstallprompt 발생 → 네이티브 설치 */
          <button
            onClick={handleInstall}
            className="mt-5 w-full h-[52px] bg-primary text-white rounded-xl font-bold text-[18px]"
          >
            홈 화면에 추가하기
          </button>
        )}

        <button
          onClick={handleDismiss}
          className="mt-3 w-full h-[44px] text-sm text-muted-foreground"
        >
          나중에 할게요
        </button>
      </div>
    </div>
  )
}
