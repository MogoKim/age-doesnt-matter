'use client'

import { useMemo } from 'react'

export interface AppEnvironment {
  isTWA: boolean
  isStandalone: boolean
  supportsWebPush: boolean
  notificationPermission: NotificationPermission
}

export function useAppEnvironment(): AppEnvironment {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        isTWA: false,
        isStandalone: false,
        supportsWebPush: false,
        notificationPermission: 'default' as NotificationPermission,
      }
    }

    // TWA: android-app:// referrer 또는 display-mode standalone + Android UA (WebView 제외)
    const runtimeTwa =
      document.referrer.startsWith('android-app://') ||
      (matchMedia('(display-mode: standalone)').matches &&
        /Android/i.test(navigator.userAgent) &&
        !navigator.userAgent.includes('wv')) // wv = WebView (카카오 등) 제외

    // sticky: OAuth 복귀 시 referrer 소실로 TWA 놓침 방지 → 첫 감지 시 저장, 이후 유지
    let isTWA = runtimeTwa
    try {
      if (runtimeTwa) localStorage.setItem('_is_twa', '1')
      else if (localStorage.getItem('_is_twa') === '1') isTWA = true
    } catch {
      /* localStorage 불가 환경 무시 */
    }

    return {
      isTWA,
      isStandalone: matchMedia('(display-mode: standalone)').matches,
      supportsWebPush: 'PushManager' in window && 'serviceWorker' in navigator,
      notificationPermission: 'Notification' in window ? Notification.permission : 'denied',
    }
  }, [])
}
