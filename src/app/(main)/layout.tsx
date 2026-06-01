import { Suspense } from 'react'
import { cookies } from 'next/headers'
import dynamic from 'next/dynamic'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import KakaoSdkScript from '@/components/common/KakaoSdkScript'
import AuthBanners from './AuthBanners'

const OfflineBanner = dynamic(
  () => import('@/components/common/OfflineBanner'),
  { loading: () => null, ssr: false },
)
const WelcomeToast = dynamic(
  () => import('@/components/common/WelcomeToast').then(m => ({ default: m.WelcomeToast })),
  { loading: () => null, ssr: false },
)

// 무거운 클라이언트 컴포넌트 — 초기 번들 제외
const PushPermissionToast = dynamic(
  () => import('@/components/common/PushPermissionToast').then(m => ({ default: m.PushPermissionToast })),
  { loading: () => null, ssr: false },
)
const PopupRenderer = dynamic(
  () => import('@/components/common/PopupRenderer'),
  { loading: () => null, ssr: false },
)
const ProgressBar = dynamic(
  () => import('@/components/common/ProgressBar'),
  { ssr: false },
)

const VALID_FONT_SIZES = ['NORMAL', 'LARGE', 'XLARGE'] as const
type FontSizeValue = typeof VALID_FONT_SIZES[number]

function getLayoutFontSize(): FontSizeValue {
  try {
    const stored = cookies().get('unao-font-size')?.value
    if (stored && VALID_FONT_SIZES.includes(stored as FontSizeValue)) return stored as FontSizeValue
  } catch {}
  return 'NORMAL'
}

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const fontSize = getLayoutFontSize()

  return (
    <FontSizeProvider fontSize={fontSize}>
      <KakaoSdkScript />
      <ProgressBar />
      <WelcomeToast />
      <OfflineBanner />
      <MainLayout>{children}</MainLayout>
      {/* SignupPromptBanner: auth 의존, MainLayout 바깥 Suspense */}
      <Suspense fallback={null}>
        <AuthBanners />
      </Suspense>
      <PopupRenderer />
      <PushPermissionToast />
    </FontSizeProvider>
  )
}
