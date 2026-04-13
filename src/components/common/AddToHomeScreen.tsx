'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Trigger = 'home30s' | 'signup' | 'engagement'

const KEY_SHOWN = 'pwa_shown_triggers'   // JSON Trigger[]
const KEY_COUNT = 'pwa_declined_count'   // number (max 3)
const KEY_INSTALLED = 'pwa_installed'    // '1'

function getInstalled() {
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

function canShow(t: Trigger): boolean {
  if (getInstalled()) return false
  if (parseInt(localStorage.getItem(KEY_COUNT) ?? '0') >= 3) return false
  const shown = getShown()
  if (t === 'home30s') return !shown.includes('home30s')
  if (t === 'signup')  return shown.includes('home30s') && !shown.includes('signup')
  if (t === 'engagement') return shown.includes('signup') && !shown.includes('engagement')
  return false
}

export default function AddToHomeScreen() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((t: Trigger) => {
    if (canShow(t)) { markShown(t); setVisible(true) }
  }, [])

  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent))

    if (getInstalled()) localStorage.setItem(KEY_INSTALLED, '1')

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
    }
    const onPWAPrompt = (e: Event) => {
      show((e as CustomEvent<Trigger>).detail)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('pwa-prompt', onPWAPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('pwa-prompt', onPWAPrompt)
    }
  }, [show])

  // 홈페이지 30초 타이머
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (pathname === '/') {
      timerRef.current = setTimeout(() => show('home30s'), 30_000)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [pathname, show])

  const handleInstall = async () => {
    if (deferredRef.current) {
      await deferredRef.current.prompt()
      const { outcome } = await deferredRef.current.userChoice
      if (outcome === 'accepted') localStorage.setItem(KEY_INSTALLED, '1')
    }
    setVisible(false)
  }

  const handleDismiss = () => {
    const c = parseInt(localStorage.getItem(KEY_COUNT) ?? '0')
    localStorage.setItem(KEY_COUNT, String(c + 1))
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-end" onClick={handleDismiss}>
      <div
        className="w-full bg-card rounded-t-2xl border-t border-border p-6 pb-10 shadow-2xl"
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

        {isIOS ? (
          /* iOS: 수동 안내 */
          <div className="mt-5 bg-muted/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-foreground">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <span>하단 <strong>공유 버튼</strong>을 탭하세요</span>
              <svg viewBox="0 0 24 24" className="w-5 h-5 ml-auto text-primary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
              </svg>
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
          /* Android: 브라우저 설치 프롬프트 */
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
