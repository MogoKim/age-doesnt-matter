interface ResponsiveAdProps {
  mobile: React.ReactNode
  desktop: React.ReactNode
}

/**
 * CSS 기반 반응형 광고 래퍼 (v2 — hydration mismatch 근본 해결)
 *
 * 이전 버전 문제:
 * - 'use client' + useIsDesktop() → SSR 기본값 false → 데스크탑 hydration mismatch
 * - 데스크탑에서 모바일 콘텐츠 플래시 후 사라짐
 *
 * v2 변경:
 * - 서버 컴포넌트 (use client 제거)
 * - CSS display로 반응형 분기 → hydration 불일치 원천 차단
 * - 양쪽 모두 SSR 렌더링 → SEO 개선
 */
export default function ResponsiveAd({ mobile, desktop }: ResponsiveAdProps) {
  return (
    <>
      {mobile && <div className="block lg:hidden">{mobile}</div>}
      {desktop && <div className="hidden lg:block">{desktop}</div>}
    </>
  )
}
