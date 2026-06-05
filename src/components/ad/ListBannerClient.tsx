'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gtmAdClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'

// GNB 바로 아래 띠배너를 노출할 6개 목록 페이지 (정확 매칭 — 상세/글쓰기 등 제외)
const AD_ROUTES = ['/best', '/community/stories', '/community/life2', '/community/humor', '/magazine', '/jobs']

// 광고는 사용자가 닫을 수 없음 (닫기 버튼 없음 — 노출 보장)
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
  const [index, setIndex] = useState(0)
  const impressed = useRef<Set<string>>(new Set())

  const onAdRoute = AD_ROUTES.includes(pathname)
  // targetPath: null=전체 공통 / 값=해당 경로에서만
  const visible = banners.filter((b) => !b.targetPath || b.targetPath === pathname)
  const safeIndex = visible.length ? index % visible.length : 0
  const current = visible[safeIndex] ?? null

  // 2개 이상이면 자동 슬라이드 (모션 최소화 설정 존중)
  useEffect(() => {
    if (!onAdRoute || visible.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % visible.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [onAdRoute, visible.length])

  // 노출 추적 (배너별 1회)
  useEffect(() => {
    if (!onAdRoute || !current) return
    if (impressed.current.has(current.id)) return
    impressed.current.add(current.id)
    fetch('/api/ad-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId: current.id }),
      keepalive: true,
    }).catch(() => {})
  }, [onAdRoute, current])

  if (!onAdRoute || !current) return null

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
      fill
      className="object-cover object-center"
      sizes="(max-width: 1200px) 100vw, 1200px"
    />
  ) : current.htmlCode ? (
    <div className="absolute inset-0 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: current.htmlCode }} />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground">
      {current.title ?? ''}
    </div>
  )

  // 링크가 있으면 내부(Link)/외부(a) 분기, 없으면 그대로 (전체 클릭 영역)
  const body = current.clickUrl
    ? isExternal
      ? (
        <a
          href={current.clickUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => handleClick(current.id, current.adType)}
          className="absolute inset-0 block"
        >
          {inner}
        </a>
      )
      : (
        <Link
          href={current.clickUrl}
          onClick={() => handleClick(current.id, current.adType)}
          className="absolute inset-0 block"
        >
          {inner}
        </Link>
      )
    : inner

  // 히어로 배너와 동일: 좌우 풀블리드(데스크탑 max-w-1200 중앙) + 고정 비율 + object-cover
  return (
    <div
      className={cn(
        'relative w-full mx-auto max-w-[1200px] mb-2 overflow-hidden bg-muted',
        '[aspect-ratio:5/2] lg:[aspect-ratio:8/3]',
      )}
      role="complementary"
      aria-label="광고"
    >
      {body}
    </div>
  )
}
