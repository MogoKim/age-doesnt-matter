import { auth } from '@/lib/auth'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import OfflineBanner from '@/components/common/OfflineBanner'
import PopupRenderer from '@/components/common/PopupRenderer'
import { PushPermissionToast } from '@/components/common/PushPermissionToast'
import { WelcomeToast } from '@/components/common/WelcomeToast'
import { SignupPromptBanner } from '@/components/common/SignupPromptBanner'

const INAPP_UTM_SOURCES = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp']

export default async function MainGroupLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode
  searchParams?: Promise<{ [key: string]: string | undefined }>
}) {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const nickname = session?.user?.nickname
  // fontSize는 JWT 토큰에 포함 — 별도 DB 쿼리 없음
  const fontSize = session?.user?.fontSize
  const createdAt = session?.user?.createdAt

  // ?signup=1&utm_source=kakao-android 파라미터 감지 (인앱 → 외부브라우저 리다이렉트 확인)
  const params = searchParams ? await searchParams : {}
  const signupAutoTrigger = params?.signup === '1' && INAPP_UTM_SOURCES.includes(params?.utm_source ?? '')
  const signupUtmSource = params?.utm_source ?? ''

  return (
    <FontSizeProvider fontSize={fontSize}>
      <WelcomeToast />
      <OfflineBanner />
      <MainLayout isLoggedIn={isLoggedIn} nickname={nickname}>
        {children}
      </MainLayout>
      <SignupPromptBanner
        isLoggedIn={isLoggedIn}
        createdAt={createdAt}
        signupAutoTrigger={signupAutoTrigger}
        signupUtmSource={signupUtmSource}
      />
      <PopupRenderer />
      <PushPermissionToast />
    </FontSizeProvider>
  )
}
