import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Script from 'next/script'
import { GTMScript, GTMNoScript } from '@/components/common/GoogleTagManager'
import { ToastProvider } from '@/components/common/Toast'
import ServiceWorkerRegister from '@/components/common/ServiceWorkerRegister'
import PageViewTracker from '@/components/common/PageViewTracker'
import AuthProvider from '@/components/common/AuthProvider'
import './globals.css'

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
  metadataBase: new URL('https://www.age-doesnt-matter.com'),
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
      'google-adsense-account': 'ca-pub-4117999106913048',
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
        <link rel="preconnect" href="https://img.age-doesnt-matter.com" />
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://img.age-doesnt-matter.com" />
        <GTMScript />
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4117999106913048"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className={pretendard.className}>
        <GTMNoScript />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
          <ServiceWorkerRegister />
          <PageViewTracker />
        </AuthProvider>
      </body>
    </html>
  )
}
