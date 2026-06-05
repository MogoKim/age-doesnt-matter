'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gtmAdClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'

// GNB 바로 아래 띠배너를 노출할 6개 목록 페이지 (정확 매칭 — 상세/글쓰기 등 제외)
const AD_ROUTES = ['/best', '/community/stories', '/community/life2', '/community/humor', '/magazine', '/jobs']

const DISMISS_KEY = 'list-ad-dismissed'
const ROTATE_MS = 7000

export interface ListBannerItem {
  id: string
  adType: string
  title: string | null
  imageUrl: string | null
  htmlCode: string | null
  clickUrl: string | null
  targetPath: string | null
}

export default function ListBannerClient({ banners }: { banners: ListBannerItem[] }) {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)
  const [index, setIndex] = useState(0)
  const impressed = useRef<Set<string>>(new Set())

  const onAdRoute = AD_ROUTES.includes(pathname)
  // targetPath: null=전체 공통 / 값=해당 경로에서만
  const visible = banners.filter((b) => !b.targetPath || b.targetPath === pathname)
  const safeIndex = visible.length ? index % visible.length : 0
  const current = visible[safeIndex] ?? null

  // 세션 내 닫기 상태 복원
  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) setDismissed(true)
  }, [])

  // 2개 이상이면 자동 슬라이드 (모션 최소화 설정 존중)
  useEffect(() => {
    if (!onAdRoute || dismissed || visible.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % visible.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [onAdRoute, dismissed, visible.length])

  // 노출 추적 (배너별 1회)
  useEffect(() => {
    if (!onAdRoute || dismissed || !current) return
    if (impressed.current.has(current.id)) return
    impressed.current.add(current.id)
    fetch('/api/ad-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId: current.id }),
      keepalive: true,
    }).catch(() => {})
  }, [onAdRoute, dismissed, current])

  if (!onAdRoute || dismissed || !current) return null

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  function handleClick(adId: string, adType: string) {
    gtmAdClick('LIST_HEADER', adType)
    fetch('/api/ad-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId }),
    }).catch(() => {})
  }

  const isExternal = current.clickUrl?.startsWith('https://')

  const inner = current.imageUrl ? (
    <Image
      src={current.imageUrl}
      alt={current.title ?? '광고'}
      width={1456}
      height={180}
      className="w-full h-auto"
    />
  ) : current.htmlCode ? (
    <div dangerouslySetInnerHTML={{ __html: current.htmlCode }} />
  ) : (
    <div className="flex h-[100px] items-center justify-center md:h-[90px] text-caption text-muted-foreground">
      {current.title ?? ''}
    </div>
  )

  // 링크가 있으면 내부(Link)/외부(a) 분기, 없으면 그대로
  const body = current.clickUrl
    ? isExternal
      ? (
        <a
          href={current.clickUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => handleClick(current.id, current.adType)}
          className="block"
        >
          {inner}
        </a>
      )
      : (
        <Link
          href={current.clickUrl}
          onClick={() => handleClick(current.id, current.adType)}
          className="block"
        >
          {inner}
        </Link>
      )
    : inner

  return (
    <div
      className={cn(
        'relative mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-muted',
        'lg:mx-auto lg:max-w-[960px]',
      )}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute left-2 top-2 z-10 rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-bold text-white">
        광고
      </span>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="광고 닫기"
        className="absolute right-1 top-1 z-10 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-black/30 text-white/90 hover:bg-black/50 transition-colors [-webkit-tap-highlight-color:transparent]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {body}
    </div>
  )
}
