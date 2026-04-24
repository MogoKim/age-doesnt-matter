import { auth } from '@/lib/auth'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import OfflineBanner from '@/components/common/OfflineBanner'
import PopupRenderer from '@/components/common/PopupRenderer'
import { PushPermissionToast } from '@/components/common/PushPermissionToast'
import { WelcomeToast } from '@/components/common/WelcomeToast'

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const nickname = session?.user?.nickname
  // fontSize는 JWT 토큰에 포함 — 별도 DB 쿼리 없음
  const fontSize = session?.user?.fontSize

  return (
    <FontSizeProvider fontSize={fontSize}>
      <WelcomeToast />
      <OfflineBanner />
      <MainLayout isLoggedIn={isLoggedIn} nickname={nickname}>
        {children}
      </MainLayout>
      <PopupRenderer />
      <PushPermissionToast />
    </FontSizeProvider>
  )
}
