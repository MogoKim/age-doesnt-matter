'use client'

import dynamic from 'next/dynamic'

/**
 * 글쓰기 FAB 을 **클라이언트 전용**으로 로드한다 — Next 16/React 19 전환, 2026-09-09.
 *
 * 왜: `FAB` 은 그리는 내용이 전적으로 브라우저 상태에 달려 있다 —
 * `usePathname()` 으로 노출/목적지를 정하고, `collapsed` 는 **스크롤 이벤트**로 바뀌며
 * 그 값이 SVG 의 `width`·`height`·`strokeWidth` 와 클래스까지 바꾼다.
 *
 * 홈 `/` 은 길고 광고 iframe 이 많아 레이아웃이 늦게 안정화된다. 그래서 hydration 이
 * 끝나기 전에 스크롤 이벤트가 들어와 `setCollapsed` 가 불리고, React 19 의 엄격해진
 * hydration 검사가 이를 #418 로 드러낸다("this tree will be regenerated on the client").
 * Next 14/React 18 에서는 조용히 넘어가던 것이다 — migration regression 이다.
 *
 * 이분 탐색으로 확정했다(각 10회씩): MainLayout 에서 FAB 만 제거하면 **0/20**,
 * 두면 19/20. TopPromoBanner · 광고 띠배너 · 상단 네비 · Footer · client 경계는 모두 배제됐다.
 *
 * 고치는 방향은 경고를 숨기는 게 아니라 **선언을 사실과 맞추는 것**이다.
 * 서버가 만들 수 없는 UI 이므로 클라이언트 전용으로 선언한다. FAB 은 스크롤 반응형
 * 글쓰기 버튼이라 SSR HTML 에 있을 이유가 없고, 노출 규칙·목적지·라벨은 그대로다.
 */
const FABImpl = dynamic(() => import('./FAB'), { ssr: false, loading: () => null })

export default function FABLazy() {
  return <FABImpl />
}
