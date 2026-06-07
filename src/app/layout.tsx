import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import { GTMScript, GTMNoScript } from '@/components/common/GoogleTagManager'
import { ToastProvider } from '@/components/common/Toast'
import AuthProvider from '@/components/common/AuthProvider'
import './globals.css'

// PWA/트래킹 컴포넌트 — 초기 번들 제외, 인터랙션 후 로드
const AddToHomeScreen = dynamic(
  () => import('@/components/common/AddToHomeScreen'),
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

const pretendard = localFont({
  src: '../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  display: 'swap',
  weight: '45 920',
  variable: '--font-pretendard',
})

export const metadata: Metadata = {
  title: {
    default: '우리 나이가 어때서 — 우나어',
    template: '%s | 우나어',
  },
  description: '50·60대가 나이 걱정 없이 일자리와 소통을 찾는 따뜻한 커뮤니티',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '우리 나이가 어때서',
    images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: '우나어' }],
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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '우나어',
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
    <html lang="ko" className={pretendard.variable}>
      <head>
        {/* 폰트 크기 flicker 방지 — localStorage 기반, SSR cookies() 의존 없음 */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=localStorage.getItem('unao-font-size');if(s==='LARGE'||s==='XLARGE'){document.documentElement.setAttribute('data-font-size',s)}}catch{}` }} />
        <link rel="preconnect" href="https://img.age-doesnt-matter.com" />
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="anonymous" />
        <GTMScript />
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? 'ca-pub-4117999106913048'}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className={pretendard.className}>
        <GTMNoScript />
        <AuthProvider>
          <ToastProvider>
            {children}
            <AddToHomeScreen />
          </ToastProvider>
          <ServiceWorkerRegister />
          <PageViewTracker />
          <GtagLoader />
          <WebVitalsReporter />
        </AuthProvider>
      </body>
    </html>
  )
}
