import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { ToastProvider } from '@/components/common/Toast'
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
  metadataBase: new URL('https://age-doesnt-matter.com'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '우리 나이가 어때서',
  },
  robots: {
    index: true,
    follow: true,
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
      <body className={pretendard.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
