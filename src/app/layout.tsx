import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import { cookies, headers } from 'next/headers'
import { GTMScript, GTMNoScript } from '@/components/common/GoogleTagManager'
import { BOT_UA_PATTERN } from '@/lib/bot-patterns'
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
  { loading: () => null },
)
const PageViewTracker = dynamic(
  () => import('@/components/common/PageViewTracker'),
  { loading: () => null },
)
const GtagLoader = dynamic(
  () => import('@/components/common/GtagLoader'),
  { loading: () => null },
)

const VALID_FONT_SIZES = ['NORMAL', 'LARGE', 'XLARGE'] as const
type FontSizeValue = typeof VALID_FONT_SIZES[number]

function getInitialFontSize(): FontSizeValue {
  try {
    const stored = cookies().get('unao-font-size')?.value
    if (stored && VALID_FONT_SIZES.includes(stored as FontSizeValue)) {
      return stored as FontSizeValue
    }
  } catch {
    // cookies() 접근 실패 시 기본값
  }
  return 'NORMAL'
}

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
      'naver-site-verification': '62a3c316645c9ebba7f716a9e2d2a6992336aa3c',
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
  const initialFontSize = getInitialFontSize()
  const fontSizeAttr = initialFontSize !== 'NORMAL' ? initialFontSize : undefined
  const headersList = headers()
  const isBot = headersList.has('x-bot-type') || BOT_UA_PATTERN.test(headersList.get('user-agent') ?? '')
  return (
    <html lang="ko" className={pretendard.variable} {...(fontSizeAttr ? { 'data-font-size': fontSizeAttr } : {})}>
      <head>
        <link rel="preconnect" href="https://img.age-doesnt-matter.com" />
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="anonymous" />
        {!isBot && <GTMScript />}
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? 'ca-pub-4117999106913048'}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className={pretendard.className}>
        {!isBot && <GTMNoScript />}
        <AuthProvider>
          <ToastProvider>
            {children}
            <AddToHomeScreen />
          </ToastProvider>
          <ServiceWorkerRegister />
          {!isBot && <PageViewTracker />}
          {!isBot && <GtagLoader />}
        </AuthProvider>
      </body>
    </html>
  )
}
