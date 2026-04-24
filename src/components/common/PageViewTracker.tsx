'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trackEvent } from '@/lib/track'
import { gtmPageView, gtmLogin, gtmSetUserProperties, captureUtm } from '@/lib/gtm'

// 하드 리프레시마다 login 이벤트 중복 발사 방지.
// useRef는 리프레시 시 초기화되므로 sessionStorage 플래그 사용.
const SESSION_LOGIN_KEY = 'unao_login_ev'

export default function PageViewTracker() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
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
    // user_id undefined 전송 방지
    if (session.user?.id) {
      gtmSetUserProperties({
        user_id: session.user.id,
        user_type: 'member',
        registration_method: 'kakao',
      })
    }
  }, [status, session])

  // 페이지 이동 시 page_view
  useEffect(() => {
    trackEvent('page_view')
    gtmPageView(pathname)
  }, [pathname])

  return null
}
