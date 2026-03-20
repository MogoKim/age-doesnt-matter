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
      {/* 모바일: Header + IconMenu / 데스크탑: GNB */}
      <Header isLoggedIn={isLoggedIn} />
      <IconMenu />
      <GNB isLoggedIn={isLoggedIn} nickname={nickname} />

      <main>{children}</main>

      <FAB isLoggedIn={isLoggedIn} />
      <Footer />
    </>
  )
}
