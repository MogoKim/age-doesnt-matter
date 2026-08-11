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
// 앱(Capacitor) FCM 등록 — 네이티브 + 로그인 회원만 동작(웹/TWA no-op), client 전용
const AppFcmRegister = dynamic(
  () => import('@/components/features/push/AppFcmRegister'),
  { loading: () => null, ssr: false },
)
// AdMob 하단 배너 — 네이티브 앱에서만 동작(웹/TWA no-op), client 전용
const AdMobBanner = dynamic(
  () => import('@/components/ad/AdMobBanner'),
  { loading: () => null, ssr: false },
)

export const metadata: Metadata = {
  title: {
    default: '우리 나이가 어때서 — 40대 50대 여성 커뮤니티',
    template: '%s | 40대 50대 여성 커뮤니티 : 우리 나이가 어때서',
  },
  description: '갱년기·외로움·우울·자녀 걱정 — "나만 이런가" 싶으셨죠. 혼자 삭이지 말고, 같은 또래와 나눠요.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '우리 나이가 어때서',
    images: [{ url: '/og-cover.png', width: 1200, height: 630, alt: '우리 나이가 어때서 — 40대 50대 여성 커뮤니티' }],
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
        {/* 폰트 크기 flicker 방지 + 기본값 '크게' 상향 — localStorage 기반, SSR cookies() 의존 없음.
            · 미설정(신규 포함) = LARGE로 보여주되 저장하지 않는다 → "미설정" 상태를 남겨 향후 기본값 재조정 여지 보존.
            · '기본(NORMAL)'을 직접 고른 기존 사용자는 unao-font-default-v2 플래그로 딱 1회만 LARGE로 승격.
              승격 뒤 다시 '기본'을 고르면 그 선택은 그대로 존중된다(플래그가 이미 서 있으므로 재승격 없음).
            · LARGE·XLARGE는 손대지 않는다.
            · localStorage 접근은 안쪽 try로 격리 — Safari 프라이빗 등에서 setItem이 던져도 속성 적용은 반드시 수행. */}
        <script dangerouslySetInnerHTML={{ __html: `try{
var K='unao-font-size',M='unao-font-default-v2',s=null,m=null;
try{s=localStorage.getItem(K);m=localStorage.getItem(M)}catch(e){}
if(!m){if(s==='NORMAL'){s='LARGE';try{localStorage.setItem(K,'LARGE')}catch(e){}}try{localStorage.setItem(M,'1')}catch(e){}}
if(s!=='NORMAL'&&s!=='LARGE'&&s!=='XLARGE'){s='LARGE'}
document.documentElement.setAttribute('data-font-size',s)
}catch(e){}` }} />
        {/* Pretendard dynamic subset은 첫 화면 이후 로드한다.
            첫 진입에서는 system-ui로 즉시 페인트하고, optional font-display로 늦은 swap CLS를 막는다. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var loaded=false;function load(){if(loaded)return;loaded=true;var l=document.createElement('link');l.rel='stylesheet';l.href='/fonts/pretendard/pretendardvariable-dynamic-subset.css';document.head.appendChild(l)}function idle(){if('requestIdleCallback'in window){requestIdleCallback(load,{timeout:2000})}else{setTimeout(load,1200)}}function schedule(){setTimeout(idle,4500)}if(document.readyState==='complete'){schedule()}else{window.addEventListener('load',schedule,{once:true})}})()` }} />
        {/* eslint-disable-next-line @next/next/no-css-tags -- JS 비활성 환경 fallback */}
        <noscript><link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css" /></noscript>
        <link rel="preconnect" href="https://img.age-doesnt-matter.com" />
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
          <AppFcmRegister />
          <AdMobBanner />
        </AuthProvider>
      </body>
    </html>
  )
}
