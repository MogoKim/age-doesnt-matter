'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trackEvent } from '@/lib/track'
import { gtmPageView, gtmLogin, gtmSetUserProperties, captureUtm } from '@/lib/gtm'

export default function PageViewTracker() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const loginTracked = useRef(false)
  const utmCaptured = useRef(false)

  // 최초 마운트 시 UTM 캡처 (광고 소재 보존)
  useEffect(() => {
    if (utmCaptured.current) return
    utmCaptured.current = true
    captureUtm()
  }, [])

  // 로그인 상태 확인 → login 이벤트 + user_properties 1회 전송
  useEffect(() => {
    if (status !== 'authenticated' || loginTracked.current) return
    loginTracked.current = true

    gtmLogin('kakao')
    gtmSetUserProperties({
      user_id: session.user?.id,
      user_type: 'member',
      registration_method: 'kakao',
    })
  }, [status, session])

  // 페이지 이동 시 page_view
  useEffect(() => {
    trackEvent('page_view')
    gtmPageView(pathname)
  }, [pathname])

  return null
}
