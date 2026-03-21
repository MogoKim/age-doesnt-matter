import Header from './Header'
import IconMenu from './IconMenu'
import GNB from './GNB'
import FAB from './FAB'
import Footer from './Footer'

interface MainLayoutProps {
  children: React.ReactNode
  isLoggedIn?: boolean
  nickname?: string
}

export default function MainLayout({
  children,
  isLoggedIn = false,
  nickname,
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

      {/* 모바일: Header + IconMenu / 데스크탑: GNB */}
      <Header isLoggedIn={isLoggedIn} />
      <IconMenu />
      <GNB isLoggedIn={isLoggedIn} nickname={nickname} />

      <main id="main-content">{children}</main>

      <FAB isLoggedIn={isLoggedIn} />
      <Footer />
    </>
  )
}
