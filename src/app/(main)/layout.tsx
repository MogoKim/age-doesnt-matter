import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { auth } from '@/lib/auth'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import OfflineBanner from '@/components/common/OfflineBanner'
import { PushPermissionToast } from '@/components/common/PushPermissionToast'
import { WelcomeToast } from '@/components/common/WelcomeToast'

// 무거운 클라이언트 컴포넌트 — 초기 번들 제외
const PopupRenderer = dynamic(
  () => import('@/components/common/PopupRenderer'),
  { loading: () => null },
)
const SignupPromptBanner = dynamic(
  () => import('@/components/common/SignupPromptBanner').then(m => ({ default: m.SignupPromptBanner })),
  { loading: () => null },
)
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

  return (
    <FontSizeProvider fontSize={fontSize}>
      <WelcomeToast />
      <OfflineBanner />
      <MainLayout isLoggedIn={isLoggedIn} nickname={nickname}>
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
