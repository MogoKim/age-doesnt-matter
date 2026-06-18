'use client'

import { useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { safeKakaoCallbackUrl } from '@/lib/kakao-start'

/**
 * 앱(Capacitor) 딥링크 수신 핸들러 — 루트 레이아웃에 마운트.
 *
 * 시스템 브라우저 OAuth 완료 → bridge가 `com.agenotmatter.app://auth?token=...`(또는 ?error=...)로 복귀.
 *  - token: Credentials('app-handoff')로 WebView 세션 발급 → cb로 이동(needsOnboarding이면 미들웨어가 /onboarding 가로챔)
 *  - error: /auth/error로 이동(앱 내 안내)
 *
 * window.Capacitor 부재(웹/TWA)면 아무것도 하지 않는다.
 */

const SCHEME_PREFIX = 'com.agenotmatter.app://'

function b64urlDecodeCb(token: string): string {
  try {
    const body = token.split('.')[0]
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b64)))
    const payload = JSON.parse(json) as { cb?: string }
    return safeKakaoCallbackUrl(typeof payload.cb === 'string' ? payload.cb : '/')
  } catch {
    return '/'
  }
}

export default function AppDeepLinkHandler() {
  useEffect(() => {
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    let removeListener: (() => void) | undefined

    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith(SCHEME_PREFIX)) return

        // 시스템 브라우저 닫기(있으면)
        void import('@capacitor/browser').then(({ Browser }) => Browser.close().catch(() => {}))

        const params = new URL(url).searchParams
        const error = params.get('error')
        const token = params.get('token')

        if (error) {
          window.location.href = `/auth/error?error=${encodeURIComponent(error)}`
          return
        }
        if (!token) return

        const res = await signIn('app-handoff', { token, redirect: false })
        if (res?.ok && !res.error) {
          window.location.href = b64urlDecodeCb(token)
        } else {
          window.location.href = '/auth/error?error=HandoffFailed'
        }
      }).then((handle) => {
        removeListener = () => { void handle.remove() }
      })
    })

    return () => { removeListener?.() }
  }, [])

  return null
}
