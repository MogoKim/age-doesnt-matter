'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type TopPromoBannerClient from './TopPromoBannerClient'

/**
 * 상단 홍보 배너를 **클라이언트 전용**으로 로드한다 — Next 16/React 19 전환, 2026-09-09.
 *
 * 왜: `TopPromoBannerClient` 는 표시 여부를 전적으로 브라우저 상태로 정한다 —
 * `useAppSession()`(회원/비회원에 따라 다른 설정) · `sessionStorage`(오늘 닫음) ·
 * `useAppEnvironment()`(Capacitor/TWA/standalone). 서버는 이 중 아무것도 알 수 없어
 * **SSR HTML 에 이 배너 마크업이 실제로 0건**이었다(홈·목록 모두 실측).
 *
 * 그런데 컴포넌트 자체는 SSR 트리에 들어가 있었고, React 19 의 엄격해진 hydration 검사에서
 * 홈 `/` 이 재현율 9/10 으로 #418(hydration mismatch)을 냈다. 이분 탐색으로 확정했다 —
 * 이 컴포넌트를 빼면 0/5, 되살리면 9/10. (Suspense fallback 을 null 로 바꾼 것만으로는 남았다.)
 *
 * 고치는 방향은 경고를 숨기는 게 아니라 **선언을 사실과 맞추는 것**이다.
 * 클라이언트만 알 수 있는 UI 이므로 클라이언트 전용으로 선언한다. 서버가 조회한 설정은
 * 그대로 props 로 내려가므로 배너 동작·문구·추적은 변하지 않는다.
 */
const TopPromoBannerClientImpl = dynamic(() => import('./TopPromoBannerClient'), {
  ssr: false,
  loading: () => null,
})

export default function TopPromoBannerClientLazy(
  props: ComponentProps<typeof TopPromoBannerClient>,
) {
  return <TopPromoBannerClientImpl {...props} />
}
