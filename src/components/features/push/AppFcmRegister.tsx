'use client'

import { useEffect, useRef } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { isAppNative } from '@/lib/analytics/app-analytics'
import { registerFcmToken, listenFcmTokenRefresh } from '@/lib/push/fcm-register'

/**
 * 앱(Capacitor 네이티브) FCM 등록 — 루트 레이아웃에 마운트. 웹/TWA는 no-op.
 *
 * 로그인(authenticated) 회원에 한해, 홈 첫 전환이 안정된 뒤(2.5s) OS 알림 권한을 요청하고
 * FCM token을 서버에 저장한다. 가입 직후 즉시 권한 팝업을 띄우지 않는다(50·60대 부담 최소화 —
 * PushPermissionToast의 signup 1800ms defer와 같은 철학). 세션당 1회만 시도.
 *
 * 웹 사용자는 PushPermissionToast(웹푸시/VAPID)가 담당 → 앱(WebView)에선 env.supportsWebPush=false라
 * 토스트가 뜨지 않으므로 본 컴포넌트와 충돌하지 않는다.
 */
export default function AppFcmRegister() {
  const { status } = useAppSession()
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!isAppNative()) return
    if (status !== 'authenticated') return
    if (attemptedRef.current) return
    attemptedRef.current = true

    let cleanup = () => {}
    const timer = setTimeout(() => {
      void registerFcmToken()
      void listenFcmTokenRefresh().then((fn) => { cleanup = fn })
    }, 2500)

    return () => {
      clearTimeout(timer)
      cleanup()
    }
  }, [status])

  return null
}
