'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gtmAdClick } from '@/lib/gtm'
import { resolveHeroLink } from '@/lib/hero-link'
import { isDetailRoute } from '@/lib/detail-routes'

// 목록 띠와 같은 7초. 사용자가 닫을 수 없다(노출 보장).
const ROTATE_MS = 7000

/**
 * 광고 라벨을 붙이지 않는 유형 — 우리가 만든 브랜드 배너.
 * 나머지(EXTERNAL·GOOGLE·COUPANG)는 남의 광고라 라벨을 반드시 보여준다.
 * 라벨을 숨기면 광고 표기 의무 위반이라, 기본값은 "붙인다"이고 SELF만 예외다.
 */
const BRAND_AD_TYPES = new Set(['SELF'])

export interface DetailHeaderBannerItem {
  id: string
  adType: string
  title: string | null
  imageUrl: string | null
  htmlCode: string | null
  clickUrl: string | null
  targetPath: string | null
}

export default function DetailHeaderBannerClient({ banners }: { banners: DetailHeaderBannerItem[] }) {
  const pathname = usePathname()
  const [index, setIndex] = useState(0)
  const impressed = useRef<Set<string>>(new Set())

  // 상세 글 화면에서만 — 목록·글쓰기·수정·시리즈·지역은 @/lib/detail-routes가 걸러낸다
  const onDetailRoute = isDetailRoute(pathname)

  // targetPath: 빈/null=상세 전체 / 콤마 구분 다중 경로=해당 경로에서만.
  // 상세는 글마다 경로가 달라 보통 비워 두고 전체 노출로 쓴다.
  const visible = banners.filter((b) => {
    if (!b.targetPath) return true
    const paths = b.targetPath.split(',').map((s) => s.trim()).filter(Boolean)
    if (paths.length === 0) return true
    // 상세 경로는 /community/stories/abc123 처럼 뒤에 글 id가 붙는다.
    // 어드민에 /community/stories 를 넣으면 그 게시판 글 전체에 걸리도록 접두어로 본다.
    return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  })

  const safeIndex = visible.length ? index % visible.length : 0
  const current = visible[safeIndex] ?? null

  // 2개 이상이면 자동 슬라이드 (모션 최소화 설정 존중)
  useEffect(() => {
    if (!onDetailRoute || visible.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % visible.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [onDetailRoute, visible.length])

  // 노출 추적 — 배너별 1회. 글을 옮겨 다녀도 같은 배너를 두 번 세지 않는다.
  useEffect(() => {
    if (!onDetailRoute || !current) return
    if (impressed.current.has(current.id)) return
    impressed.current.add(current.id)
    fetch('/api/ad-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId: current.id }),
      keepalive: true,
    }).catch(() => {})
  }, [onDetailRoute, current])

  if (!onDetailRoute || !current) return null

  const isAd = !BRAND_AD_TYPES.has(current.adType)

  function handleClick(adId: string, adType: string) {
    gtmAdClick('DETAIL_HEADER', adType)
    // 외부 링크는 새 탭으로 넘어가며 fetch가 취소될 수 있다 → sendBeacon으로 먼저 보낸다.
    // sendBeacon이 없는 브라우저만 keepalive fetch로 떨어진다.
    const body = JSON.stringify({ adId })
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/ad-click', new Blob([body], { type: 'application/json' }))
      return
    }
    fetch('/api/ad-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  }

  // clickUrl이 비어 있으면 링크 없이 이미지만 렌더한다.
  // 값이 있으면 resolveHeroLink가 internal / external / blocked를 가른다 —
  // blocked(javascript: 등)는 href가 '/'로 되돌아가 안전하게 홈으로 간다.
  const link = current.clickUrl ? resolveHeroLink(current.clickUrl) : null

  const inner = current.imageUrl ? (
    <Image
      src={current.imageUrl}
      alt={current.title ?? (isAd ? '광고' : '')}
      fill
      className="object-cover object-center"
      sizes="(max-width: 720px) 100vw, 720px"
    />
  ) : current.htmlCode ? (
    <div className="absolute inset-0 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: current.htmlCode }} />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground">
      {current.title ?? ''}
    </div>
  )

  const body = link
    ? link.kind === 'external'
      ? (
        <a
          href={link.href}
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
          href={link.href}
          onClick={() => handleClick(current.id, current.adType)}
          className="absolute inset-0 block"
        >
          {inner}
        </Link>
      )
    : inner

  // 모바일 풀블리드 / 데스크탑은 상세 본문 폭(720)에 맞춰 중앙 정렬.
  // 5:1 고정 — 375px에서 75px, 720px에서 144px. 상세 상단은 히어로가 아니라 얇은 띠다.
  return (
    <div
      className="relative w-full mx-auto max-w-[720px] overflow-hidden bg-muted [aspect-ratio:5/1]"
      role="complementary"
      aria-label={isAd ? '광고' : '배너'}
    >
      {body}
      {/* 광고 라벨 — 소재 우상단. 읽기 시작 전에 광고임을 알 수 있어야 한다.
          브랜드(SELF) 배너에는 붙이지 않는다. 클릭을 가리지 않도록 pointer-events 해제. */}
      {isAd && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[11px] leading-tight text-white">
          광고
        </span>
      )}
    </div>
  )
}
