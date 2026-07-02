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
 * - **각 슬롯은 자기 slotId 기준으로 독립적으로** load/setRect/hide/destroy 한다(화면당 개수 제한 없음).
 *   → 웹 모바일 광고 배치와 동일하게 한 화면에 여러 슬롯(예: 홈 feed-1/feed-2)이 각각 노출된다.
 * - no-fill(loaded=false)/로드 실패/플러그인 미탑재 → **해당 슬롯만** 접어서 공간 제거.
 *
 * [위치 갱신 — 뷰포트 진입 보장]
 *   과거 버그: scroll 이벤트(rAF)에만 의존 → 페이지 하단 슬롯(feed-2)이 스크롤 정착 시 마지막 샘플이
 *   offscreen(hide)이면 그대로 숨김 유지되어 표시 안 됨.
 *   보강:
 *     (1) 로드 직후 1회 pushRect
 *     (2) scroll/resize rAF 갱신
 *     (3) **IntersectionObserver**로 placeholder가 뷰포트에 진입/이탈하는 순간 pushRect 강제 호출
 *     (4) scroll 정착 후 trailing timeout 1회 보정
 *   ⇒ 슬롯이 뷰포트에 들어오면 반드시 setRect가 호출되어 표시된다.
 */

interface NativeAdSlotProps {
  /** 슬롯 식별자(네이티브 뷰 맵 키) — 화면당 고유해야 뷰가 충돌하지 않음 */
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
  const [collapsed, setCollapsed] = useState(false) // no-fill/실패 시 이 슬롯만 공간 제거
  const boxRef = useRef<HTMLDivElement>(null)

  // 마운트 후에만 네이티브 여부 확정(SSR/hydration 안전) — 웹에선 항상 fallback.
  useEffect(() => { setNative(isAppNative()) }, [])

  useEffect(() => {
    if (native !== true) return
    const el = boxRef.current
    if (!el) return

    setCollapsed(false) // 라우트 변경 등으로 재실행 시 초기화

    let cancelled = false
    let rafId = 0
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    let loaded = false
    let io: IntersectionObserver | undefined

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
    // scroll/resize: rAF 1회 + 정착 후 trailing 보정 1회(마지막 샘플이 offscreen이어도 정착 위치로 재갱신)
    const onScroll = () => {
      if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; pushRect() })
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => { pushRect() }, 180)
    }

    AdMobNative.load({ slotId, adUnitId })
      .then((res) => {
        if (cancelled) return
        if (!res?.loaded) { setCollapsed(true); return } // no-fill → 이 슬롯만 공간 제거
        loaded = true
        pushRect() // 로드 직후 1회
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
        // 뷰포트 진입/이탈 순간 확실히 갱신 — 스크롤 정착 상태에서도 진입 시 setRect 보장.
        io = new IntersectionObserver(() => { pushRect() }, { threshold: [0, 0.01, 1] })
        io.observe(el)
      })
      .catch(() => { if (!cancelled) setCollapsed(true) }) // 플러그인 미탑재/실패 → 이 슬롯만 공간 제거

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (settleTimer) clearTimeout(settleTimer)
      if (io) io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      AdMobNative.destroy({ slotId }).catch(() => {})
    }
    // pathname 포함: 라우트 변경 시 cleanup(destroy) 후 새 화면 기준으로 재로드
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
