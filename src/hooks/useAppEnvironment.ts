'use client'

import { useMemo } from 'react'

export interface AppEnvironment {
  isTWA: boolean
  /** Capacitor 네이티브 앱(iOS/Android shell) 내부 실행 여부. 네이티브 런타임이 주입하는 window.Capacitor로 감지. */
  isCapacitor: boolean
  isStandalone: boolean
  supportsWebPush: boolean
  notificationPermission: NotificationPermission
}

/** Capacitor 네이티브 shell 감지 — window.Capacitor는 네이티브 런타임만 주입(웹에선 @capacitor/core 미탑재라 부재). */
function detectCapacitor(): boolean {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap) return false
  return typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : true
}

export function useAppEnvironment(): AppEnvironment {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        isTWA: false,
        isCapacitor: false,
        isStandalone: false,
        supportsWebPush: false,
        notificationPermission: 'default' as NotificationPermission,
      }
    }

    // TWA(Play스토어 앱)만 = android-app:// referrer.
    //   PWA(웹을 홈화면 설치)도 standalone이지만 "앱"이 아니므로 제외 → 게이트 대상에서 빠지고 웹(배너) 대상이 됨.
    const runtimeTwa = document.referrer.startsWith('android-app://')

    // sticky: OAuth 복귀 시 referrer 소실 방지 → android-app:// 본 적 있을 때만 저장(_twa_confirmed).
    //   기존 _is_twa 키는 PWA standalone도 저장돼 오염됐으므로 새 키로 교체.
    let isTWA = runtimeTwa
    try {
      if (runtimeTwa) localStorage.setItem('_twa_confirmed', '1')
      else if (localStorage.getItem('_twa_confirmed') === '1') isTWA = true
    } catch {
      /* localStorage 불가 환경 무시 */
    }

    return {
      isTWA,
      isCapacitor: detectCapacitor(),
      isStandalone: matchMedia('(display-mode: standalone)').matches,
      supportsWebPush: 'PushManager' in window && 'serviceWorker' in navigator,
      notificationPermission: 'Notification' in window ? Notification.permission : 'denied',
    }
  }, [])
}
