'use client'

import { useState, useEffect } from 'react'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { detectEnv } from './AddToHomeScreen'
import { buildPlayStoreUrl } from '@/lib/app-links'
import { gtmPlayStoreClick, gtmOutboundClick } from '@/lib/gtm'

// footer 공식 채널 링크 (SNS 전 채널 공통 + 구글플레이 채널 차등).
//  - 구글플레이 노출 규칙: !isTWA && !isStandalone && env ∈ {android-chrome, other, desktop}
//    (이미 앱=TWA/PWA, 안드앱 불가=iOS, 외부유도 별도=인앱 → 숨김)
//  - R1(하이드레이션): useAppEnvironment는 SSR=false라 직접 분기 시 TWA에 깜빡임+mismatch.
//    → playChannel을 useState(null)로 시작하고 useEffect(마운트 후)에서만 판정 노출. SSR/클라 동일=mismatch 0.

interface Sns {
  network: string
  label: string
  href: string
}

const SNS_LINKS: Sns[] = [
  { network: 'threads', label: '스레드', href: 'https://www.threads.com/@age.no.matter?hl=ko' },
  { network: 'instagram', label: '인스타그램', href: 'https://www.instagram.com/age.no.matter/' },
  { network: 'facebook', label: '페이스북', href: 'https://www.facebook.com/profile.php?id=61590818695710' },
  { network: 'naver_blog', label: '블로그', href: 'https://blog.naver.com/age-doesnt-matter' },
]

export default function FooterChannelLinks() {
  const { isTWA, isStandalone } = useAppEnvironment()
  const [playChannel, setPlayChannel] = useState<string | null>(null) // null=숨김 / 'web_android' / 'web_desktop'

  useEffect(() => {
    if (isTWA || isStandalone) {
      setPlayChannel(null) // 이미 앱(TWA)/홈화면 설치(PWA) → 구글플레이 숨김
      return
    }
    const env = detectEnv()
    if (env === 'desktop') setPlayChannel('web_desktop')
    else if (env === 'android-chrome' || env === 'other') setPlayChannel('web_android')
    else setPlayChannel(null) // iOS·인앱 → 숨김
  }, [isTWA, isStandalone])

  const isAndroidWeb = playChannel === 'web_android'

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 공식 SNS — 전 채널 공통 */}
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="공식 채널">
        {SNS_LINKS.map((s) => (
          <a
            key={s.network}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${s.label} (새 창)`}
            onClick={() => gtmOutboundClick(s.network, 'footer')}
            className="inline-flex min-h-11 items-center px-1 py-2 text-caption text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* 구글플레이 — 웹-안드(강조)·데스크탑(보조)만. R1 effect 가드로 노출(TWA/PWA/iOS 숨김) */}
      {playChannel && (
        <a
          href={buildPlayStoreUrl(playChannel)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="안드로이드 앱 설치 — Google Play (새 창)"
          onClick={() => gtmPlayStoreClick(`footer_${playChannel}`)}
          className={
            isAndroidWeb
              ? 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-secondary px-4 py-2 text-caption font-bold text-foreground no-underline transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary'
              : 'inline-flex min-h-11 items-center gap-1 px-2 py-2 text-caption text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary'
          }
        >
          <span aria-hidden="true">📱</span>
          {isAndroidWeb ? '안드로이드 앱 설치' : '안드로이드 앱'}
        </a>
      )}
    </div>
  )
}
