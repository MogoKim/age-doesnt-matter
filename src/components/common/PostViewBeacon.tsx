'use client'

import { useEffect, useRef } from 'react'

interface PostViewBeaconProps {
  postId: string
}

/**
 * 게시글 조회 시 PostView DB 기록 (비회원은 서버에서 스킵)
 * - 마운트 시 1회 전송(조회 기록) + 스크롤하며 도달한 최대 readPercent 추적
 * - pagehide / visibilitychange(hidden) / unmount 시 최종 최대값을 sendBeacon으로 전송
 * - upsert이므로 마지막 전송값(최대 도달률)이 남는다
 */
export default function PostViewBeacon({ postId }: PostViewBeaconProps) {
  const maxRef = useRef(0)

  useEffect(() => {
    function measure() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      // 본문이 한 화면 이내(스크롤 불필요)면 100%로 간주
      const pct = scrollable <= 0 ? 100 : Math.round((window.scrollY / scrollable) * 100)
      const clamped = Math.min(100, Math.max(0, pct))
      if (clamped > maxRef.current) maxRef.current = clamped
    }

    function send() {
      navigator.sendBeacon(
        `/api/posts/${postId}/view`,
        JSON.stringify({ readPercent: maxRef.current }),
      )
    }

    // 초기 측정 + 조회 기록 1회 (진입 시점 도달률)
    measure()
    send()

    function onScroll() {
      measure()
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') send()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', send)

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', send)
      // SPA 라우팅 이탈(unmount) 시 최종 최대값 전송
      send()
    }
  }, [postId])

  return null
}
