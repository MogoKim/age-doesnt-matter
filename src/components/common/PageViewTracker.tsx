'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { trackEvent } from '@/lib/track'
import { gtmPageView, gtmLogin, gtmSetUserProperties, captureUtm, getBrowserEnv, getStoredUtm } from '@/lib/gtm'

// 하드 리프레시마다 login 이벤트 중복 발사 방지.
// useRef는 리프레시 시 초기화되므로 sessionStorage 플래그 사용.
const SESSION_LOGIN_KEY = 'unao_login_ev'

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

    gtmLogin('kakao')
    trackEvent('login', { method: 'kakao', browser_env: getBrowserEnv() })
    // user_id undefined 전송 방지
    if (user?.id) {
      void gtmSetUserProperties({
        user_id: user.id,
        user_type: 'member',
        registration_method: 'kakao',
      })
    }
  }, [status, user])

  // 페이지 이동 시 page_view (UTM 동봉 — 레퍼럴/유입 채널을 EventLog에서 추적)
  useEffect(() => {
    trackEvent('page_view', { browser_env: getBrowserEnv(), ...getStoredUtm() })
    gtmPageView(pathname)
  }, [pathname])

  return null
}
