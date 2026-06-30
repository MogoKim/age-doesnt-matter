'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { trackEvent } from '@/lib/track'
import { gtmPageView, gtmLogin, gtmSetUserProperties, captureUtm, getBrowserEnv, getStoredUtm } from '@/lib/gtm'
import { appLogEvent, isAppNative, getAppPlatform } from '@/lib/analytics/app-analytics'

// 하드 리프레시마다 login 이벤트 중복 발사 방지.
// useRef는 리프레시 시 초기화되므로 sessionStorage 플래그 사용.
const SESSION_LOGIN_KEY = 'unao_login_ev'

// EventLog properties에 넣을 환경 마커. Capacitor 앱이면 browser_env를 capacitor-*로 분리(android-chrome 혼입 방지)
// + app_native/app_platform 추가. 웹/TWA/인앱은 기존 getBrowserEnv() 유지. (DB schema 무변경 — properties JSON만 확장)
function envMarker(): Record<string, unknown> {
  if (!isAppNative()) return { browser_env: getBrowserEnv(), app_native: false }
  const platform = getAppPlatform() ?? 'android' // 'android' | 'ios'
  return { browser_env: `capacitor-${platform}`, app_native: true, app_platform: platform }
}

export default function PageViewTracker() {
  const pathname = usePathname()
  const { user, status } = useAppSession()
  const utmCaptured = useRef(false)

  // 최초 마운트 시 UTM 캡처 (광고 소재 보존)
  useEffect(() => {
    if (utmCaptured.current) return
    utmCaptured.current = true
    captureUtm()
  }, [])

  // 로그인 상태 확인 → login 이벤트 + user_properties 세션 내 1회만 전송
  useEffect(() => {
    if (status !== 'authenticated') return
    if (sessionStorage.getItem(SESSION_LOGIN_KEY)) return
    sessionStorage.setItem(SESSION_LOGIN_KEY, '1')

    if (isAppNative()) {
      // 앱: GA4 app stream에만 native logEvent. gtag(web stream) 호출 금지(오염 방지).
      appLogEvent('login', { method: 'kakao' })
    } else {
      gtmLogin('kakao')
      // user_id undefined 전송 방지
      if (user?.id) {
        void gtmSetUserProperties({
          user_id: user.id,
          user_type: 'member',
          registration_method: 'kakao',
        })
      }
    }
    trackEvent('login', { method: 'kakao', ...envMarker() })
  }, [status, user])

  // 페이지 이동 시 page_view (UTM 동봉 — 레퍼럴/유입 채널을 EventLog에서 추적)
  useEffect(() => {
    trackEvent('page_view', { ...envMarker(), ...getStoredUtm() })
    // 앱: gtag(web stream) page_view 미전송. 웹/TWA만 기존 gtmPageView 유지.
    if (!isAppNative()) gtmPageView(pathname)
  }, [pathname])

  return null
}
