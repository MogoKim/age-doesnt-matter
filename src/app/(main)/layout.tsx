import dynamic from 'next/dynamic'
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import KakaoSdkScript from '@/components/common/KakaoSdkScript'
import ClientErrorBeacon from '@/components/common/ClientErrorBeacon' // [임시 진단]

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
const KakaoShareDebugPanel = dynamic(
  () => import('@/components/common/KakaoShareDebugPanel'),
  { loading: () => null, ssr: false },
)
const SignupPromptBanner = dynamic(
  () => import('@/components/common/SignupPromptBanner').then(m => ({ default: m.SignupPromptBanner })),
  { loading: () => null, ssr: false },
)

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <FontSizeProvider>
      <ClientErrorBeacon />
      <KakaoSdkScript />
      <ProgressBar />
      <WelcomeToast />
      <OfflineBanner />
      <MainLayout>{children}</MainLayout>
      <SignupPromptBanner />
      <PopupRenderer />
      <PushPermissionToast />
      <KakaoShareDebugPanel />
    </FontSizeProvider>
  )
}
