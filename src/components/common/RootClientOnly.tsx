'use client'

import dynamic from 'next/dynamic'

/**
 * 루트 레이아웃의 client 전용 컴포넌트 묶음 — Next 16 전환(2026-09-09).
 *
 * Next 15+ 부터 **Server Component 안에서는 `next/dynamic` 의 `ssr: false` 를 쓸 수 없다.**
 * `app/layout.tsx` 는 Server Component 라 거기 있던 선언을 이 client 경계로 옮겼다.
 * 렌더 위치와 순서는 그대로다 — 옮기면서 배치를 바꾸면 무엇이 깨졌는지 알 수 없게 된다.
 *
 * 전부 prop 이 없고 부수효과만 있는 컴포넌트다(PWA 설치 유도 · SW 등록 · 트래킹 · 네이티브 브리지).
 */

const PullToRefresh = dynamic(() => import('@/components/common/PullToRefresh'), { loading: () => null, ssr: false })
const AddToHomeScreen = dynamic(() => import('@/components/common/AddToHomeScreen'), { loading: () => null, ssr: false })
const ServiceWorkerRegister = dynamic(() => import('@/components/common/ServiceWorkerRegister'), { loading: () => null, ssr: false })
const PageViewTracker = dynamic(() => import('@/components/common/PageViewTracker'), { loading: () => null, ssr: false })
const GtagLoader = dynamic(() => import('@/components/common/GtagLoader'), { loading: () => null, ssr: false })
const WebVitalsReporter = dynamic(() => import('@/components/common/WebVitalsReporter'), { loading: () => null, ssr: false })
// 앱(Capacitor) 딥링크 핸들러 — 네이티브에서만 동작(웹/TWA no-op)
const AppDeepLinkHandler = dynamic(() => import('@/components/features/auth/AppDeepLinkHandler'), { loading: () => null, ssr: false })
// 앱(Capacitor) FCM 등록 — 네이티브 + 로그인 회원만 동작(웹/TWA no-op)
const AppFcmRegister = dynamic(() => import('@/components/features/push/AppFcmRegister'), { loading: () => null, ssr: false })
// AdMob 하단 배너 — 네이티브 앱에서만 동작(웹/TWA no-op)
const AdMobBanner = dynamic(() => import('@/components/ad/AdMobBanner'), { loading: () => null, ssr: false })

/** ToastProvider 안쪽에 있던 둘 — 토스트 컨텍스트를 쓴다. */
export function RootClientInsideToast() {
  return (
    <>
      <PullToRefresh />
      <AddToHomeScreen />
    </>
  )
}

/** AuthProvider 안쪽·ToastProvider 바깥에 있던 것들. */
export function RootClientOutsideToast() {
  return (
    <>
      <ServiceWorkerRegister />
      <PageViewTracker />
      <GtagLoader />
      <WebVitalsReporter />
      <AppDeepLinkHandler />
      <AppFcmRegister />
      <AdMobBanner />
    </>
  )
}
