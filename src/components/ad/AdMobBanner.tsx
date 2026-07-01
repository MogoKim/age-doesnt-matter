'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { isAppNative } from '@/lib/analytics/app-analytics'

/**
 * AdMob 하단 배너 — **Capacitor 네이티브 앱에서만** 동작. 웹/브라우저/TWA는 no-op.
 *
 * - 광고 단위는 실제 AdMob banner 광고 단위 ID(우나어). app readiness 승인 후 정상 serve.
 * - WebView 위에 네이티브 배너를 anchored bottom으로 표시(@capacitor-community/admob).
 * - 홈 첫 진입 체감 우선 → 허용 라우트에서도 **최소 2초 defer 후** 표시.
 * - 금지 라우트(로그인·온보딩·인증·글쓰기)에서는 숨김.
 * - GA4 native 이벤트(sign_up/onboarding_complete/login) 경로와 무관. gtag 차단 유지(이 컴포넌트는 gtag 미사용).
 *
 * [재노출 규칙 — @capacitor-community/admob 세만틱]
 *   showBanner  = 배너 최초 "생성". 이미 배너가 있으면 네이티브에서 no-op/에러(→.catch로 삼켜짐).
 *   hideBanner  = 화면에서 숨김(배너는 메모리에 유지, 나중에 다시 보일 수 있음).
 *   resumeBanner= 숨긴 배너를 "다시 표시".
 *   ⇒ 최초 1회만 showBanner로 생성하고, 이후 복귀 시에는 반드시 resumeBanner로 재노출한다.
 *      (과거 버그: 복귀 시 showBanner를 재호출 → 이미 존재하는 배너라 실패 → 다시 안 뜸)
 *   경합 방지: 모든 비동기 명령에 seq를 부여하고, 실행 직전 "가장 최신 명령(=현재 pathname)"인지
 *              확인하여 오래된 hide/show가 최종 상태를 덮어쓰지 못하게 한다.
 */

// 실제 Android banner 광고 단위 ID (AdMob — 우나어 홈 하단 배너).
const BANNER_ID = 'ca-app-pub-4117999106913048/3137309547'

// 배너를 숨길 라우트(접두사 매칭) — 로그인/온보딩/인증/글쓰기 흐름 방해 금지.
const HIDE_PREFIXES = ['/login', '/onboarding', '/auth', '/community/write']

// 홈 첫 진입 직후 바로 띄우지 않음(체감 우선).
const SHOW_DELAY_MS = 2000

function shouldHide(pathname: string): boolean {
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default function AdMobBanner() {
  const pathname = usePathname()
  const createdRef = useRef(false) // showBanner로 배너를 최초 생성했는지
  const opSeqRef = useRef(0)       // 최신 명령 판별용 단조 증가 시퀀스

  useEffect(() => {
    // 네이티브 앱에서만 — 웹/TWA는 아무것도 하지 않음.
    if (!isAppNative()) return

    const hide = shouldHide(pathname)
    const seq = ++opSeqRef.current // 이 effect(=현재 pathname)가 낸 최신 명령
    // 실행 직전 여전히 최신 명령인지 확인 — 오래된 hide/show가 최종 상태를 덮어쓰지 못하게.
    const isLatest = () => seq === opSeqRef.current
    let timer: ReturnType<typeof setTimeout> | undefined

    const applyHide = async () => {
      if (!createdRef.current) return // 생성된 배너가 없으면 숨길 것도 없음
      const { AdMob } = await import('@capacitor-community/admob')
      if (!isLatest()) return
      await AdMob.hideBanner().catch(() => {})
    }

    const applyShow = async () => {
      const { AdMob, BannerAdPosition, BannerAdSize } = await import('@capacitor-community/admob')
      if (!isLatest()) return
      if (!createdRef.current) {
        // 최초 1회: SDK 초기화 + 배너 생성
        await AdMob.initialize().catch(() => {})
        if (!isLatest()) return
        await AdMob.showBanner({
          adId: BANNER_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
        }).catch(() => {})
        createdRef.current = true
      } else {
        // 복귀: 숨긴 배너를 재노출 (showBanner 재호출 금지 — 위 주석 참조)
        await AdMob.resumeBanner().catch(() => {})
      }
    }

    if (hide) {
      // 금지 라우트: 즉시 숨김(defer 없음)
      void applyHide()
    } else {
      // 허용 라우트: 매번 최소 2초 defer 후 (재)노출
      timer = setTimeout(() => { void applyShow() }, SHOW_DELAY_MS)
    }

    // cleanup: 예약만 취소(다음 네비게이션 시). 실행 중인 show를 중단시키는 플래그는 두지 않는다
    // — 최종 상태는 위 seq(isLatest) 가드가 '현재 pathname' 기준으로 보장한다.
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [pathname])

  return null
}
