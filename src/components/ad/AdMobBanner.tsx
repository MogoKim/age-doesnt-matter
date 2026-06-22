'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { isAppNative } from '@/lib/analytics/app-analytics'

/**
 * AdMob 하단 배너 — **Capacitor 네이티브 앱에서만** 동작. 웹/브라우저/TWA는 no-op.
 *
 * - 현재 광고 단위는 Google 공식 **테스트 ID**(수익 없음). 실제 광고 단위 ID는 확보 후 교체.
 * - WebView 위에 네이티브 배너를 anchored bottom으로 표시(@capacitor-community/admob).
 * - 홈 첫 진입 체감 우선 → 허용 라우트에서도 **최소 2초 defer 후** 표시.
 * - 금지 라우트(로그인·온보딩·인증·글쓰기)에서는 숨김.
 * - GA4 native 이벤트(sign_up/onboarding_complete/login) 경로와 무관. gtag 차단 유지(이 컴포넌트는 gtag 미사용).
 */

// Google 공식 Android 테스트 banner ad unit ID (수익 없음). 실제 ID 확보 후 교체.
const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111'

// 배너를 숨길 라우트(접두사 매칭) — 로그인/온보딩/인증/글쓰기 흐름 방해 금지.
const HIDE_PREFIXES = ['/login', '/onboarding', '/auth', '/community/write']

// 홈 첫 진입 직후 바로 띄우지 않음(체감 우선).
const SHOW_DELAY_MS = 2000

function shouldHide(pathname: string): boolean {
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default function AdMobBanner() {
  const pathname = usePathname()
  const initedRef = useRef(false)
  const shownRef = useRef(false)

  useEffect(() => {
    // 네이티브 앱에서만 — 웹/TWA는 아무것도 하지 않음.
    if (!isAppNative()) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const hideBanner = async () => {
      const { AdMob } = await import('@capacitor-community/admob')
      await AdMob.hideBanner().catch(() => {})
      shownRef.current = false
    }

    const showBanner = async () => {
      const { AdMob, BannerAdPosition, BannerAdSize } = await import('@capacitor-community/admob')
      if (cancelled) return
      if (!initedRef.current) {
        await AdMob.initialize().catch(() => {})
        initedRef.current = true
      }
      if (cancelled) return
      await AdMob.showBanner({
        adId: TEST_BANNER_ID,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: true, // 테스트 ID와 함께 항상 테스트 모드(정책 안전)
      }).catch(() => {})
      shownRef.current = true
    }

    if (shouldHide(pathname)) {
      // 금지 라우트: 이미 떠 있으면 즉시 숨김(defer 없음)
      if (shownRef.current) void hideBanner()
    } else {
      // 허용 라우트: 최소 2초 defer 후 표시
      timer = setTimeout(() => { void showBanner() }, SHOW_DELAY_MS)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [pathname])

  return null
}
