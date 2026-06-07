'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/track'

interface PostViewBeaconProps {
  postId: string
}

/** 정독 완료로 간주하는 스크롤 도달률 (SignupPromptBanner 트리거와 동일 기준) */
const READ_COMPLETE_THRESHOLD = 85

/**
 * 게시글 조회 시 정독률 측정
 * - PostView DB 기록은 회원 전용(서버에서 비회원 스킵) — 기존 유지
 * - 추가: 비회원 포함 정독률을 EventLog로 측정(trackEvent → _anon_sid 자동 부착, DB 스키마 변경 없음)
 *   · post_read: 이탈 시 최종 최대 도달률
 *   · post_read_complete: 85% 도달 시 1회 (정독 완료 신호)
 */
export default function PostViewBeacon({ postId }: PostViewBeaconProps) {
  const maxRef = useRef(0)
  const completeFiredRef = useRef(false)

  useEffect(() => {
    function measure() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      // 본문이 한 화면 이내(스크롤 불필요)면 100%로 간주
      const pct = scrollable <= 0 ? 100 : Math.round((window.scrollY / scrollable) * 100)
      const clamped = Math.min(100, Math.max(0, pct))
      if (clamped > maxRef.current) maxRef.current = clamped
      // 85% 정독 완료 — 세션당 글당 1회만 신호
      if (!completeFiredRef.current && maxRef.current >= READ_COMPLETE_THRESHOLD) {
        completeFiredRef.current = true
        trackEvent('post_read_complete', { post_id: postId, read_percent: maxRef.current })
      }
    }

    function send() {
      navigator.sendBeacon(
        `/api/posts/${postId}/view`,
        JSON.stringify({ readPercent: maxRef.current }),
      )
      // 비회원 포함 정독률 측정 (track은 _anon_sid 자동 부착, path로 게시판 추론 가능)
      trackEvent('post_read', { post_id: postId, read_percent: maxRef.current })
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
