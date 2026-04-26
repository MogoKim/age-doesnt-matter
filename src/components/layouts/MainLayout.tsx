import Header from './Header'
import IconMenu from './IconMenu'
import GNB from './GNB'
import FAB from './FAB'
import Footer from './Footer'
import TopPromoBanner from './TopPromoBanner'

interface MainLayoutProps {
  children: React.ReactNode
  isLoggedIn?: boolean
  nickname?: string
  unreadCount?: number
}

export default function MainLayout({
  children,
  isLoggedIn = false,
  nickname,
  unreadCount = 0,
}: MainLayoutProps) {
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
      <TopPromoBanner />

      {/* 모바일: Header + IconMenu / 데스크탑: GNB */}
      <Header isLoggedIn={isLoggedIn} unreadCount={unreadCount} />
      <IconMenu />
      <GNB isLoggedIn={isLoggedIn} nickname={nickname} unreadCount={unreadCount} />

      <main id="main-content" className="pb-[72px] lg:pb-0">{children}</main>

      <FAB isLoggedIn={isLoggedIn} />
      <Footer />
    </>
  )
}
