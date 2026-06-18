'use client'

import { useEffect } from 'react'

/**
 * 앱(Capacitor) OAuth 플로우에서 발생한 에러(FemaleOnly/AccessDenied 등)를
 * 딥링크로 앱 WebView에 복귀시킨다. 웹/TWA는 이 컴포넌트를 거치지 않는다(서버에서 app_login 쿠키로 분기).
 */
export default function AppAuthErrorRedirect({ error }: { error: string }) {
  useEffect(() => {
    window.location.href = `com.agenotmatter.app://auth?error=${encodeURIComponent(error)}`
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <p className="text-lg text-muted-foreground">앱으로 돌아가는 중…</p>
    </div>
  )
}
