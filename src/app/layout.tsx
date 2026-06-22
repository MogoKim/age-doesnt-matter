import type { Metadata, Viewport } from 'next'
import dynamic from 'next/dynamic'
import { GTMScript, GTMNoScript } from '@/components/common/GoogleTagManager'
import { ToastProvider } from '@/components/common/Toast'
import AuthProvider from '@/components/common/AuthProvider'
import AdSenseScriptLoader from '@/components/ad/AdSenseScriptLoader'
import './globals.css'

// PWA/트래킹 컴포넌트 — 초기 번들 제외, 인터랙션 후 로드
const AddToHomeScreen = dynamic(
  () => import('@/components/common/AddToHomeScreen'),
  { loading: () => null, ssr: false },
)
const PullToRefresh = dynamic(
  () => import('@/components/common/PullToRefresh'),
  { loading: () => null, ssr: false },
)
const ServiceWorkerRegister = dynamic(
  () => import('@/components/common/ServiceWorkerRegister'),
  { loading: () => null, ssr: false },
)
const PageViewTracker = dynamic(
  () => import('@/components/common/PageViewTracker'),
  { loading: () => null, ssr: false },
)
const GtagLoader = dynamic(
  () => import('@/components/common/GtagLoader'),
  { loading: () => null, ssr: false },
)
const WebVitalsReporter = dynamic(
  () => import('@/components/common/WebVitalsReporter'),
  { loading: () => null, ssr: false },
)
// 앱(Capacitor) 딥링크 핸들러 — 네이티브에서만 동작(웹/TWA no-op), client 전용
const AppDeepLinkHandler = dynamic(
  () => import('@/components/features/auth/AppDeepLinkHandler'),
  { loading: () => null, ssr: false },
)
// AdMob 하단 배너 — 네이티브 앱에서만 동작(웹/TWA no-op, 테스트 ID), client 전용
const AdMobBanner = dynamic(
  () => import('@/components/ad/AdMobBanner'),
  { loading: () => null, ssr: false },
)

export const metadata: Metadata = {
  title: {
    default: '우리 나이가 어때서 — 40대 50대 60대 여성 커뮤니티',
    template: '%s | 40대 50대 60대 여성 커뮤니티 : 우리 나이가 어때서',
  },
  description: '갱년기·외로움·우울·자녀 걱정 — "나만 이런가" 싶으셨죠. 혼자 삭이지 말고, 같은 또래와 나눠요.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '우리 나이가 어때서',
    images: [{ url: '/og-cover.png', width: 1200, height: 630, alt: '우리 나이가 어때서 — 40대 50대 60대 여성 커뮤니티' }],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION ?? undefined,
    other: {
      'google-adsense-account': process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? 'ca-pub-4117999106913048',
      'naver-site-verification': ['f3e97b22a6f0ca4d7bbb2081bb3c50ddf8c149e5', 'dd29f33d5f95183061d1cf478d578911196ffb9a'],
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    shortcut: '/favicon.ico',
    // apple 키 없음 → /apple-touch-icon.png 자동 사용 (iOS 앱 아이콘 불변)
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '우리나이가어때서',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#FF6F61',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트 크기 flicker 방지 — localStorage 기반, SSR cookies() 의존 없음 */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=localStorage.getItem('unao-font-size');if(s==='LARGE'||s==='XLARGE'){document.documentElement.setAttribute('data-font-size',s)}}catch{}` }} />
        {/* Pretendard Variable dynamic-subset — unicode-range 기반 분할 로드.
            브라우저가 실제 렌더된 글자가 속한 서브셋(~30KB)만 다운로드 → 초기 폰트 전송 2.0MB→수십 KB.
            ⚡ 렌더 블로킹 방지(C1): CSS를 preload(즉시 다운로드 시작) + 인라인 script로 stylesheet 비동기 주입.
            → 첫 페인트를 막지 않음. font-display:swap이라 텍스트는 system-ui로 즉시 보이고 폰트 도착 시 swap.
            subset.91(라틴/숫자/기호)은 초기 렌더 critical이라 폰트 자체를 preload. */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.91.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="style" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='/fonts/pretendard/pretendardvariable-dynamic-subset.css';document.head.appendChild(l)})()` }} />
        {/* eslint-disable-next-line @next/next/no-css-tags -- JS 비활성 환경 fallback */}
        <noscript><link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css" /></noscript>
        <link rel="preconnect" href="https://img.age-doesnt-matter.com" />
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="anonymous" />
        <GTMScript />
      </head>
      <body>
        <GTMNoScript />
        <AuthProvider>
          <ToastProvider>
            {children}
            <PullToRefresh />
            <AddToHomeScreen />
          </ToastProvider>
          <ServiceWorkerRegister />
          <PageViewTracker />
          <GtagLoader />
          <WebVitalsReporter />
          <AdSenseScriptLoader />
          <AppDeepLinkHandler />
          <AdMobBanner />
        </AuthProvider>
      </body>
    </html>
  )
}
