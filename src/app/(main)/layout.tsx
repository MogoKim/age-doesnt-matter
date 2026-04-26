import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import OfflineBanner from '@/components/common/OfflineBanner'
import PopupRenderer from '@/components/common/PopupRenderer'
import { PushPermissionToast } from '@/components/common/PushPermissionToast'
import { WelcomeToast } from '@/components/common/WelcomeToast'
import { SignupPromptBanner } from '@/components/common/SignupPromptBanner'
import { getCachedUnreadCount } from '@/lib/queries/notifications'

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const nickname = session?.user?.nickname
  // fontSize는 JWT 토큰에 포함 — 별도 DB 쿼리 없음 (root layout 쿠키 SSR 병행)
  const fontSize = session?.user?.fontSize
  const createdAt = session?.user?.createdAt

  // 미읽은 알림 수 — 30초 캐시, 에러 시 0 폴백
  const unreadCount = isLoggedIn && session.user?.id
    ? await getCachedUnreadCount(session.user.id)
    : 0

  return (
    <FontSizeProvider fontSize={fontSize}>
      <WelcomeToast />
      <OfflineBanner />
      <MainLayout isLoggedIn={isLoggedIn} nickname={nickname} unreadCount={unreadCount}>
        {children}
      </MainLayout>
      {/* useSearchParams() 사용으로 Suspense 경계 필요 */}
      <Suspense fallback={null}>
        <SignupPromptBanner isLoggedIn={isLoggedIn} createdAt={createdAt} />
      </Suspense>
      <PopupRenderer />
      <PushPermissionToast />
    </FontSizeProvider>
  )
}
