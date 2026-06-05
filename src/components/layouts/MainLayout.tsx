import { Suspense } from 'react'
import IconMenu from './IconMenu'
import Footer from './Footer'
import TopPromoBanner from './TopPromoBanner'
import Header from './Header'
import GNB from './GNB'
import FAB from './FAB'
import ListBanner from '@/components/ad/ListBanner'

interface MainLayoutProps {
  children: React.ReactNode
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

      {/* 전 페이지 최상단 홍보 띠 배너 */}
      <Suspense fallback={<div className="h-[56px]" />}>
        <TopPromoBanner />
      </Suspense>

      {/* 모바일: Header / 데스크탑: GNB — useSession() 기반, auth() 없음 */}
      <Header />
      <GNB />

      {/* 모바일 전용 아이콘 메뉴 */}
      <IconMenu />

      {/* 목록 페이지(6개) GNB 아래 광고 띠배너 — 경로 게이트는 클라에서 처리 */}
      <Suspense fallback={null}>
        <ListBanner />
      </Suspense>

      <main id="main-content" className="pb-[72px] lg:pb-0">{children}</main>

      {/* FAB — useSession() 기반, auth() 없음 */}
      <FAB />

      <Footer />
    </>
  )
}
