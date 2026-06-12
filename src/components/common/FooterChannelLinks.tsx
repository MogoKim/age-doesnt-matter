'use client'

import { useState, useEffect } from 'react'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { detectEnv } from './AddToHomeScreen'
import { buildPlayStoreUrl } from '@/lib/app-links'
import { gtmPlayStoreClick, gtmOutboundClick } from '@/lib/gtm'

// footer 공식 채널 (SNS 아이콘 = 전 채널 공통 / Google Play = 웹-안드·데스크탑만).
//  - 구글플레이 노출 규칙: !isTWA && !isStandalone && env ∈ {android-chrome, other, desktop}
//  - R1(하이드레이션): useState(null)+useEffect로만 노출 판정 → SSR/클라 동일=mismatch 0, TWA 깜빡임 0.
//  - Play 섹션은 구분선 포함 통째로 조건 렌더 → TWA/PWA에선 섹션째 사라져 footer가 짧아짐.

interface Sns {
  network: string
  label: string
  href: string
  color: string
  path: string
}

// 브랜드 아이콘(simple-icons) — 브랜드 컬러로 인식성↑
const SNS_LINKS: Sns[] = [
  {
    network: 'threads',
    label: '스레드',
    href: 'https://www.threads.com/@age.no.matter?hl=ko',
    color: '#000000',
    path: 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.166 1.43 1.781 3.631 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.475 7.797c.98-1.454 2.568-2.256 4.471-2.256h.044c3.181.02 5.073 1.95 5.262 5.32.108.046.216.094.32.144 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Z',
  },
  {
    network: 'instagram',
    label: '인스타그램',
    href: 'https://www.instagram.com/age.no.matter/',
    color: '#E4405F',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
  },
  {
    network: 'facebook',
    label: '페이스북',
    href: 'https://www.facebook.com/profile.php?id=61590818695710',
    color: '#1877F2',
    path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
  {
    network: 'naver_blog',
    label: '블로그',
    href: 'https://blog.naver.com/age-doesnt-matter',
    color: '#03C75A',
    path: 'M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845Z',
  },
]

// Google Play 공식 삼각형 (단색)
const PLAY_PATH =
  'M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.41 12l2.488-2.49zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z'

export default function FooterChannelLinks() {
  const { isTWA, isStandalone } = useAppEnvironment()
  const [playChannel, setPlayChannel] = useState<string | null>(null) // null=숨김 / 'web_android' / 'web_desktop'

  useEffect(() => {
    if (isTWA || isStandalone) {
      setPlayChannel(null)
      return
    }
    const env = detectEnv()
    if (env === 'desktop') setPlayChannel('web_desktop')
    else if (env === 'android-chrome' || env === 'other') setPlayChannel('web_android')
    else setPlayChannel(null)
  }, [isTWA, isStandalone])

  return (
    <>
      {/* 섹션 2: 공식 채널 — SNS 원형 아이콘 버튼 한 줄 */}
      <section className="flex w-full flex-col items-center gap-2.5 border-t border-[#f1f1f1] py-4">
        <p className="text-caption font-bold text-muted-foreground">공식 채널</p>
        <nav className="flex items-center justify-center gap-3" aria-label="공식 SNS 채널">
          {SNS_LINKS.map((s) => (
            <a
              key={s.network}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${s.label} (새 창)`}
              onClick={() => gtmOutboundClick(s.network, 'footer')}
              className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F6F6F8] transition-transform hover:-translate-y-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill={s.color} aria-hidden="true">
                  <path d={s.path} />
                </svg>
              </span>
            </a>
          ))}
        </nav>
      </section>

      {/* 섹션 3: Google Play (웹 전용) — 구분선 포함 통째로 조건 렌더. TWA/PWA/iOS는 미렌더 */}
      {playChannel && (
        <section className="flex w-full justify-center border-t border-[#f1f1f1] py-4">
          <a
            href={buildPlayStoreUrl(playChannel)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="안드로이드 앱 설치 — Google Play (새 창)"
            onClick={() => gtmPlayStoreClick(`footer_${playChannel}`)}
            className="inline-flex items-center gap-2.5 rounded-xl bg-[#1f2430] px-4 py-2.5 text-white no-underline shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={PLAY_PATH} />
            </svg>
            <span className="flex flex-col text-left leading-tight">
              <span className="text-[10px] uppercase tracking-wide opacity-75">Google Play</span>
              <span className="text-caption font-bold">안드로이드 앱 설치</span>
            </span>
          </a>
        </section>
      )}
    </>
  )
}
