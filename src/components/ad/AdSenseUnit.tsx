'use client'

import { useEffect, useRef, useState } from 'react'
import { ADSENSE } from './ad-slots'
import CoupangBanner from './CoupangBanner'

interface AdSenseUnitProps {
  /** AdSense 광고 슬롯 ID */
  slotId: string
  /** 광고 포맷 */
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical' | 'fluid'
  /** 반응형 여부 */
  responsive?: boolean
  /** 인아티클 레이아웃 (글 본문용) */
  layout?: 'in-article'
  /** 인피드 레이아웃 키 (피드 사이용) */
  layoutKey?: string
  className?: string
  /** 고정 사이즈 (데스크탑 전용 광고에 사용, 반응형 무시) */
  fixedWidth?: number
  fixedHeight?: number
}

declare global {
  interface Window {
    adsbygoogle: Record<string, unknown>[]
  }
}

/** 광고 로드 전 레이아웃 공간 예약 → CLS 방지 */
const FORMAT_MIN_HEIGHT: Record<string, number> = {
  horizontal: 90,
  rectangle:  250,
  auto:       100,
  fluid:      250,
  vertical:   600,
}

/**
 * Google AdSense 광고 유닛 (v2 — 근본 재작성)
 *
 * 이전 버전 문제:
 * - pushed.current = true → 1회만 push, SPA 라우트 전환 시 광고 재로드 안 됨
 * - 스크립트 로드 전 push → race condition
 *
 * v2 변경:
 * - data-ad-status 감시 → unfilled 시 쿠팡 폴백
 * - 스크립트 로드 상태 확인 후 push
 */
export default function AdSenseUnit({
  slotId,
  format = 'auto',
  responsive = true,
  layout,
  layoutKey,
  className,
  fixedWidth,
  fixedHeight,
}: AdSenseUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showFallback, setShowFallback] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // [크래시 수정] 숨김(display:none, 폭 0) 또는 폭 부족 컨테이너에 adsbygoogle.push() 시
    // 문제 발생 → 저사양 안드로이드 크롬에서 렌더러 크래시("앗, 이런!").
    //  - fluid/인피드: 폭 250px 미만이면 "Fluid responsive ads must be at least 250px wide" TagError
    //  - 그 외: 모바일에서 hidden 처리된 데스크탑 광고 유닛이 폭 0으로 push되어 메모리 낭비/OOM
    // 컨테이너 폭이 확보됐을 때만 push, 아니면 push 생략(숨김 광고는 폴백도 숨겨짐).
    const isFluidUnit = format === 'fluid' || !!layoutKey
    const minWidth = isFluidUnit ? 250 : 1
    if (container.offsetWidth < minWidth) {
      container.innerHTML = ''
      setShowFallback(true)
      return
    }

    // 이전 ins 제거 (SPA 네비게이션 대응)
    container.innerHTML = ''
    setShowFallback(false)

    // 새 ins 태그 생성
    const ins = document.createElement('ins')
    ins.className = 'adsbygoogle'
    ins.setAttribute('data-ad-client', ADSENSE.CLIENT_ID)
    ins.setAttribute('data-ad-slot', slotId)
    ins.setAttribute('data-ad-format', fixedWidth && fixedHeight ? 'rectangle' : format)

    if (fixedWidth && fixedHeight) {
      ins.style.display = 'inline-block'
      ins.style.width = `${fixedWidth}px`
      ins.style.height = `${fixedHeight}px`
    } else if (layout === 'in-article') {
      ins.style.display = 'block'
      ins.style.textAlign = 'center'
      ins.setAttribute('data-ad-layout', 'in-article')
    } else {
      ins.style.display = 'block'
    }

    if (responsive && !layout && !layoutKey && !fixedWidth) {
      ins.setAttribute('data-full-width-responsive', 'true')
    }
    if (layoutKey) {
      ins.setAttribute('data-ad-layout-key', layoutKey)
    }

    container.appendChild(ins)

    // data-ad-status 감시 — unfilled 시 쿠팡 폴백
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-ad-status') {
          const status = (m.target as HTMLElement).getAttribute('data-ad-status')
          if (status === 'unfilled') {
            ;(m.target as HTMLElement).style.display = 'none'
            setShowFallback(true)
          }
        }
      }
    })
    observer.observe(ins, { attributes: true })

    // adsbygoogle.push() — 스크립트가 로드되지 않았으면 큐에 쌓임
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense 스크립트 미로드 시 무시
    }

    return () => {
      observer.disconnect()
    }
  }, [slotId, format, responsive, layout, layoutKey, fixedWidth, fixedHeight])

  return (
    <aside
      className={`relative ${className ?? ''}`}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      {/* 광고 ins가 viewport를 넘기지 않도록 가둠 — AdSense full-width-responsive/fluid가
          부모 패딩 무시하고 펼쳐지는 가로 overflow 차단 (크롬·TWA 가로 밀림 근본 수정) */}
      <div
        ref={containerRef}
        style={{
          minHeight: showFallback ? 0 : (fixedHeight ?? FORMAT_MIN_HEIGHT[format] ?? 90),
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      />
      {showFallback && (
        <CoupangBanner preset="mobile" className="mt-2" />
      )}
    </aside>
  )
}
