'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Trigger = 'home15s' | 'signup' | 'engagement' | 'return_visit' | 'weekly'

const KEY_SHOWN = 'pwa_shown_triggers'       // JSON Trigger[]
const KEY_COUNT = 'pwa_declined_count'        // number (최대 3회 — weekly 이후 정지)
const KEY_INSTALLED = 'pwa_installed'         // '1'
const KEY_LAST_PROMPTED = 'pwa_last_prompted_at' // ISO timestamp
const KEY_VISIT_COUNT = 'pwa_visit_count'    // number (재방문 감지)

const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000
const MAX_DECLINES = 3

function getInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    localStorage.getItem(KEY_INSTALLED) === '1'
  )
}

function getShown(): Trigger[] {
  try { return JSON.parse(localStorage.getItem(KEY_SHOWN) ?? '[]') } catch { return [] }
}

function markShown(t: Trigger) {
  const s = getShown()
  if (!s.includes(t)) localStorage.setItem(KEY_SHOWN, JSON.stringify([...s, t]))
}

function getDeclineCount(): number {
  return parseInt(localStorage.getItem(KEY_COUNT) ?? '0')
}

function canShow(t: Trigger): boolean {
  if (getInstalled()) return false
  const shown = getShown()

  if (t === 'home15s') return !shown.includes('home15s')
  if (t === 'signup') return shown.includes('home15s') && !shown.includes('signup')
  if (t === 'engagement') return shown.includes('signup') && !shown.includes('engagement')
  if (t === 'return_visit') return shown.includes('engagement') && !shown.includes('return_visit')
  if (t === 'weekly') {
    if (getDeclineCount() >= MAX_DECLINES) return false
    const allShown = (['home15s', 'signup', 'engagement', 'return_visit'] as Trigger[])
      .every(x => shown.includes(x))
    if (!allShown) return false
    const last = localStorage.getItem(KEY_LAST_PROMPTED)
    if (!last) return true
    return Date.now() - new Date(last).getTime() >= WEEKLY_MS
  }
  return false
}

function incrementVisitCount(): number {
  // sessionStorage: 새로고침 = 동일 방문 (중복 카운트 방지)
  if (sessionStorage.getItem('pwa_visited_this_session')) {
    return parseInt(localStorage.getItem(KEY_VISIT_COUNT) ?? '0')
  }
  sessionStorage.setItem('pwa_visited_this_session', '1')
  const count = parseInt(localStorage.getItem(KEY_VISIT_COUNT) ?? '0') + 1
  localStorage.setItem(KEY_VISIT_COUNT, String(count))
  return count
}

export default function AddToHomeScreen() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [isManual, setIsManual] = useState(false)
  const [canNativeInstall, setCanNativeInstall] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setIsManual(false)
      setVisible(true)
      return true
    }
    return false
  }, [])

  useEffect(() => {
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(iOS)

    if (getInstalled()) localStorage.setItem(KEY_INSTALLED, '1')

    // 로그인 유저 DB 상태 확인 (graceful fallback — migration 전에도 안전)
    fetch('/api/user/pwa-status')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.installed) localStorage.setItem(KEY_INSTALLED, '1') })
      .catch(() => {})

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setCanNativeInstall(true)
    }

    const onPWAPrompt = (e: Event) => {
      const trigger = (e as CustomEvent<Trigger | 'manual'>).detail
      const native = deferredRef.current !== null && !iOS

      if (trigger === 'manual') {
        // Footer 버튼: 설치 상태 / 거절 횟수 무관하게 무조건 표시
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

  // 홈 15초 타이머 + 재방문 + weekly 체크
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (pathname === '/') {
      const visitCount = incrementVisitCount()
      timerRef.current = setTimeout(() => {
        // 발동 가능한 첫 트리거 실행 (순차 우선순위)
        if (showTrigger('home15s')) return
        if (visitCount >= 2 && showTrigger('return_visit')) return
        showTrigger('weekly')
      }, 15_000)
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

  // iOS이거나 beforeinstallprompt 미발생 → 수동 안내 표시
  const showManualGuide = isIOS || !canNativeInstall

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
            src="/icons/icon-192x192.png"
            alt="우나어"
            className="w-14 h-14 rounded-2xl flex-shrink-0 object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-[18px] leading-snug">홈 화면에 추가하세요</p>
            <p className="text-sm text-muted-foreground mt-1 break-keep leading-relaxed">
              바탕화면에 저장하면 앱처럼 바로 들어올 수 있어요
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
              {isIOS ? (
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
