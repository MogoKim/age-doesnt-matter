import { Suspense } from 'react'
import IconMenu from './IconMenu'
import Footer from './Footer'
import TopPromoBanner from './TopPromoBanner'
import AuthNavTop from './AuthNavTop'
import AuthFAB from './AuthFAB'

interface MainLayoutProps {
  children: React.ReactNode
}

function NavFallback() {
  return (
    <>
      <div className="h-[64px] lg:hidden bg-card border-b border-border" aria-hidden="true" />
      <div className="hidden lg:block h-16 bg-card border-b border-border" aria-hidden="true" />
    </>
  )
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <>
      {/* 스킵 네비게이션 (접근성) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        본문으로 건너뛰기
      </a>

      {/* 전 페이지 최상단 홍보 띠 배너 — Suspense로 감싸 children blocking 방지 */}
      <Suspense fallback={<div className="h-[56px]" />}>
        <TopPromoBanner />
      </Suspense>

      {/* 모바일: Header / 데스크탑: GNB — auth 의존, Suspense 스트리밍 */}
      <Suspense fallback={<NavFallback />}>
        <AuthNavTop />
      </Suspense>

      {/* 모바일 전용 아이콘 메뉴 — auth 불필요, 즉시 렌더 */}
      <IconMenu />

      <main id="main-content" className="pb-[72px] lg:pb-0">{children}</main>

      {/* FAB — auth 의존, fixed 포지션(DOM 위치 시각적 무관) */}
      <Suspense fallback={null}>
        <AuthFAB />
      </Suspense>

      <Footer />
    </>
  )
}
