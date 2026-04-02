import { auth } from '@/lib/auth'
import { getUserFontSize } from '@/lib/queries/my'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import OfflineBanner from '@/components/common/OfflineBanner'
import PopupRenderer from '@/components/common/PopupRenderer'

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const nickname = session?.user?.nickname
  const fontSize = session?.user?.id
    ? await getUserFontSize(session.user.id)
    : undefined

  return (
    <FontSizeProvider fontSize={fontSize}>
      <OfflineBanner />
      <MainLayout isLoggedIn={isLoggedIn} nickname={nickname}>
        {children}
      </MainLayout>
      <PopupRenderer />
    </FontSizeProvider>
  )
}
