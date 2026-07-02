'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { isAppNative } from '@/lib/analytics/app-analytics'
import { AdMobNative } from '@/lib/native-ads/admob-native'
import { ADMOB } from './ad-slots'

/**
 * AdMob Native Advanced 인라인 광고 슬롯 (앱 전용).
 *
 * - **Capacitor 네이티브 앱에서만** 네이티브 광고를 렌더. 웹/TWA는 `fallback`(기존 AdSense 등) 그대로.
 * - 방식: 앱에서는 빈 placeholder(높이 예약)만 DOM에 두고, 그 화면 좌표를 측정해
 *   네이티브 NativeAdView를 WebView 위 오버레이로 표시(플러그인 setRect). 콘텐츠가 광고 자리를 비워 준다.
 * - 스크롤/리사이즈 시 rAF 스로틀로 좌표 갱신, 화면 밖이면 hide, 라우트 이탈·언마운트 시 destroy.
 * - no-fill(loaded=false)/로드 실패/플러그인 미탑재 → placeholder 접어서 공간 제거.
 *
 * [화면당 1개 제한]
 *   같은 화면(pathname)에서는 **가장 먼저 마운트된 슬롯 1개만** 광고를 로드/표시한다(모듈 레벨 점유).
 *   나머지 슬롯은 접혀(height 0) 광고 요청조차 하지 않는다 → 성능/요청비용 절감 + 오버레이 중복 방지.
 *   라우트 변경 시 점유를 리셋해 새 화면의 첫 슬롯이 점유한다.
 */

// 화면당 1개 점유 게이트(모듈 레벨, 전 인스턴스 공유)
let claimPath: string | null = null
let claimSlot: string | null = null
function tryClaim(pathname: string, slotId: string): boolean {
  if (claimPath !== pathname) { claimPath = pathname; claimSlot = null } // 새 화면 → 리셋
  if (claimSlot === null) claimSlot = slotId
  return claimSlot === slotId
}
function releaseClaim(pathname: string, slotId: string): void {
  if (claimPath === pathname && claimSlot === slotId) claimSlot = null
}

interface NativeAdSlotProps {
  /** 슬롯 식별자(네이티브 뷰 맵 키 + 점유 키) — 화면당 고유 */
  slotId: string
  /** 웹/비네이티브에서 대신 렌더할 노드(기존 AdSense FeedAd 등) */
  fallback: ReactNode
  /** 광고 단위 ID(기본: 인피드 Native) */
  adUnitId?: string
  /** 예약 높이(px). 네이티브 뷰가 이 높이로 강제되므로 native_ad_view.xml 실제 높이와 일치시킬 것.
   *  운영 compact 레이아웃(media 96dp+헤더+body 1줄+CTA 40dp) 기준 ≈ 224px → 230 권장. */
  minHeight?: number
  className?: string
}

export default function NativeAdSlot({
  slotId,
  fallback,
  adUnitId = ADMOB.NATIVE_INFEED,
  minHeight = 230,
  className,
}: NativeAdSlotProps) {
  const pathname = usePathname()
  const [native, setNative] = useState<boolean | null>(null) // null=미결정(SSR), true=앱, false=웹
  const [collapsed, setCollapsed] = useState(false) // no-fill/미점유 시 공간 제거
  const boxRef = useRef<HTMLDivElement>(null)

  // 마운트 후에만 네이티브 여부 확정(SSR/hydration 안전) — 웹에선 항상 fallback.
  useEffect(() => { setNative(isAppNative()) }, [])

  useEffect(() => {
    if (native !== true) return
    const el = boxRef.current
    if (!el) return

    // 화면당 1개 제한 — 이미 다른 슬롯이 점유했으면 접고 로드 안 함.
    if (!tryClaim(pathname, slotId)) { setCollapsed(true); return }
    setCollapsed(false)

    let cancelled = false
    let rafId = 0
    let loaded = false

    const pushRect = () => {
      if (cancelled || !loaded) return
      const r = el.getBoundingClientRect()
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
        if (!res?.loaded) { setCollapsed(true); return } // no-fill → 공간 제거(점유는 유지: 추가 요청 방지)
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
      releaseClaim(pathname, slotId)
    }
    // pathname 포함: 라우트 변경 시 cleanup(destroy+release) 후 새 화면 기준으로 재점유
  }, [native, slotId, adUnitId, pathname])

  // 웹/비네이티브/SSR: 기존 광고 그대로.
  if (native !== true) return <>{fallback}</>
  // 앱: 항상 box 렌더(ref 안정). 접힘 시 높이 0(공간 제거), 아니면 예약 높이(그 위에 네이티브 오버레이).
  return (
    <div
      ref={boxRef}
      className={className}
      style={collapsed ? { height: 0, minHeight: 0, overflow: 'hidden' } : { minHeight }}
      aria-hidden
    />
  )
}
