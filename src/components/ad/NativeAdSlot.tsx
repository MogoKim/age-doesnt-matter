'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { isAppNative } from '@/lib/analytics/app-analytics'
import { AdMobNative } from '@/lib/native-ads/admob-native'
import { ADMOB } from './ad-slots'

/**
 * AdMob Native Advanced 인라인 광고 슬롯 (PoC — 앱 전용).
 *
 * - **Capacitor 네이티브 앱에서만** 네이티브 광고를 렌더. 웹/TWA는 `fallback`(기존 AdSense 등) 그대로.
 * - 방식: 앱에서는 빈 placeholder(높이 예약)만 DOM에 두고, 그 화면 좌표를 측정해
 *   네이티브 NativeAdView를 WebView 위 오버레이로 표시(플러그인 setRect). 콘텐츠가 광고 자리를 비워 준다.
 * - 스크롤/리사이즈 시 rAF 스로틀로 좌표 갱신, 화면 밖이면 hide, 라우트 이탈·언마운트 시 destroy.
 * - no-fill(loaded=false)/로드 실패/플러그인 미탑재 → placeholder 접어서 공간 제거(레이아웃 영향 최소화).
 */

interface NativeAdSlotProps {
  /** 슬롯 식별자(네이티브에서 뷰 맵 키) — 화면당 고유 */
  slotId: string
  /** 웹/비네이티브에서 대신 렌더할 노드(기존 AdSense FeedAd 등) */
  fallback: ReactNode
  /** 광고 단위 ID(기본: 홈 인피드 Native) */
  adUnitId?: string
  /** 예약 높이(px). 네이티브 뷰가 이 높이로 강제되므로 native_ad_view.xml 실제 높이와 일치시킬 것.
   *  compact 레이아웃(media 144dp+헤더+body 1줄+CTA) 기준 ≈ 300px. */
  minHeight?: number
  className?: string
}

export default function NativeAdSlot({
  slotId,
  fallback,
  adUnitId = ADMOB.NATIVE_INFEED,
  minHeight = 300,
  className,
}: NativeAdSlotProps) {
  const pathname = usePathname()
  const [native, setNative] = useState<boolean | null>(null) // null=미결정(SSR), true=앱, false=웹
  const [collapsed, setCollapsed] = useState(false) // no-fill 시 공간 제거
  const boxRef = useRef<HTMLDivElement>(null)

  // 마운트 후에만 네이티브 여부 확정(SSR/hydration 안전) — 웹에선 항상 fallback.
  useEffect(() => { setNative(isAppNative()) }, [])

  useEffect(() => {
    if (native !== true) return
    const el = boxRef.current
    if (!el) return

    let cancelled = false
    let rafId = 0
    let loaded = false

    const pushRect = () => {
      if (cancelled || !loaded) return
      const r = el.getBoundingClientRect()
      // 화면 밖(위/아래)으로 완전히 벗어나면 숨김, 아니면 위치 갱신.
      const offscreen = r.bottom <= 0 || r.top >= window.innerHeight
      if (offscreen) {
        AdMobNative.hide({ slotId }).catch(() => {})
      } else {
        AdMobNative.setRect({ slotId, x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => {})
      }
    }
    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => { rafId = 0; pushRect() })
    }

    AdMobNative.load({ slotId, adUnitId })
      .then((res) => {
        if (cancelled) return
        if (!res?.loaded) { setCollapsed(true); return } // no-fill → 공간 제거
        loaded = true
        pushRect()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
      })
      .catch(() => { if (!cancelled) setCollapsed(true) }) // 플러그인 미탑재/실패 → 공간 제거

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      AdMobNative.destroy({ slotId }).catch(() => {})
    }
    // pathname 포함: 라우트 변경 시 cleanup(destroy) 후 재시도 보장
  }, [native, slotId, adUnitId, pathname])

  // 웹/비네이티브: 기존 광고 그대로.
  if (native === false) return <>{fallback}</>
  // 앱: no-fill이면 공간 제거, 아니면 예약 높이 placeholder(그 위에 네이티브 오버레이).
  if (native === true) {
    if (collapsed) return null
    return <div ref={boxRef} className={className} style={{ minHeight }} aria-hidden />
  }
  // 미결정(SSR/최초): 웹 기준으로 fallback 렌더(하이드레이션 후 확정).
  return <>{fallback}</>
}
