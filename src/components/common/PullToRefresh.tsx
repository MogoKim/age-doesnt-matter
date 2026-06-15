'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * PullToRefresh — 전 환경(앱TWA·안드로이드 크롬·iOS Safari/PWA) 공통 "당겨서 새로고침".
 *
 * 네이티브 PTR은 globals.css의 `overscroll-behavior-y: contain`으로 꺼져 있고(에디터 충돌 방지),
 * TWA·iOS standalone은 네이티브 PTR 자체가 없으므로 커스텀으로 통일 구현한다.
 * - 스크롤러 = window(문서 자체). 최상단(scrollY<=0)에서 아래로 당길 때만 발동.
 * - 발동 기준 = **손가락 실제 이동(dy) >= TRIGGER_DY(80px)** — 보통 당김으로도 새로고침되게.
 *   (인디케이터 하강은 저항 곡선으로 damping하지만, 트리거는 원시 이동량 기준)
 * - 새로고침 = router.refresh()(soft, 흰 깜빡임 없는 서버데이터 갱신).
 * - 제외: 에디터(write/edit)·admin 라우트 / 모달·바텀시트(body overflow:hidden) / 가로스크롤 영역.
 */

const TRIGGER_DY = 80 // 발동: 손가락 실제 이동(px) — 보통 당김 수준
const MAX_VISUAL = 86 // 인디케이터 최대 하강(px)
const RESISTANCE = 0.55 // 인디케이터 하강 damping

function isExcludedPath(pathname: string): boolean {
  if (pathname.startsWith('/admin')) return true
  if (pathname.includes('/write')) return true
  if (pathname.endsWith('/edit')) return true
  return false
}

// 모달/바텀시트 열림 신호 — 앱 전역이 body overflow:hidden 으로 lock 함(재사용)
function isModalOpen(): boolean {
  return document.body.style.overflow === 'hidden'
}

// 가로 스크롤 컨테이너(IconMenu·필터칩)에서 시작했으면 세로 PTR 오발동 방지
function startedInHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el)
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth
    ) {
      return true
    }
    el = el.parentElement
  }
  return false
}

export default function PullToRefresh() {
  const router = useRouter()
  const pathname = usePathname()

  const [dy, setDy] = useState(0) // 손가락 실제 이동량(px, 당기는 중)
  const [refreshing, setRefreshing] = useState(false)

  // 핸들러가 최신값을 읽도록 ref 미러링(리스너 재구독 방지)
  const dyRef = useRef(0)
  const refreshingRef = useRef(false)
  const startYRef = useRef<number | null>(null)
  const activeRef = useRef(false)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const setDyBoth = (v: number) => {
    dyRef.current = v
    setDy(v)
  }
  const setRefreshingBoth = (v: boolean) => {
    refreshingRef.current = v
    setRefreshing(v)
  }

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      if (window.scrollY > 0) return
      if (e.touches.length !== 1) return
      if (isExcludedPath(pathnameRef.current)) return
      if (isModalOpen()) return
      if (startedInHorizontalScroller(e.target)) return
      startYRef.current = e.touches[0].clientY
      activeRef.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return
      const delta = e.touches[0].clientY - startYRef.current
      if (delta <= 0) {
        if (activeRef.current) {
          activeRef.current = false
          setDyBoth(0)
        }
        return
      }
      // 당기는 도중 최상단을 벗어났으면 취소(일반 스크롤로 위임)
      if (window.scrollY > 0) {
        startYRef.current = null
        if (activeRef.current) {
          activeRef.current = false
          setDyBoth(0)
        }
        return
      }
      activeRef.current = true
      if (e.cancelable) e.preventDefault() // 네이티브 스크롤/바운스 억제
      setDyBoth(delta)
    }

    const onTouchEnd = () => {
      if (startYRef.current === null) {
        if (activeRef.current) {
          activeRef.current = false
          setDyBoth(0)
        }
        return
      }
      const reached = dyRef.current >= TRIGGER_DY && activeRef.current
      startYRef.current = null
      activeRef.current = false
      if (reached) {
        setRefreshingBoth(true)
        setDyBoth(TRIGGER_DY)
        router.refresh()
        window.setTimeout(() => {
          setRefreshingBoth(false)
          setDyBoth(0)
        }, 700)
      } else {
        setDyBoth(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [router])

  const armed = dy >= TRIGGER_DY // 놓으면 새로고침 도달
  const progress = Math.min(dy / TRIGGER_DY, 1)
  const visualOffset = refreshing ? 60 : Math.min(dy * RESISTANCE, MAX_VISUAL)
  const visible = visualOffset > 0 || refreshing
  const dragging = startYRef.current !== null && !refreshing

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[150] flex flex-col items-center"
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
        style={{
          transform: `translateY(${visualOffset - 50}px) scale(${visible ? (armed && !refreshing ? 1.12 : 1) : 0.8})`,
          opacity: visible ? 1 : 0,
          transition: dragging ? 'none' : 'transform 0.25s ease, opacity 0.2s ease',
        }}
      >
        <div
          className={`h-6 w-6 rounded-full border-[3px] border-[#FF6F61] border-t-transparent ${refreshing ? 'animate-spin' : ''}`}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${progress * 270}deg)`, opacity: armed ? 1 : 0.4 + progress * 0.6 }
          }
        />
      </div>
      {visible && !refreshing && (
        <span
          className="mt-1 rounded-full bg-white/90 px-2 py-0.5 text-[13px] font-semibold text-[#FF6F61] shadow-sm"
          style={{
            transform: `translateY(${visualOffset - 50}px)`,
            opacity: Math.min(progress * 1.2, 1),
            transition: dragging ? 'none' : 'transform 0.25s ease, opacity 0.2s ease',
          }}
        >
          {armed ? '놓으면 새로고침' : '당겨서 새로고침'}
        </span>
      )}
    </div>
  )
}
