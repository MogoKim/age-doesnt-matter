'use client'

import { useEffect } from 'react'

interface PostViewBeaconProps {
  postId: string
}

/**
 * 게시글 조회 시 PostView DB 기록 (비회원은 서버에서 스킵)
 * sendBeacon: 비동기 fire-and-forget — 본문 렌더링 블로킹 없음
 */
export default function PostViewBeacon({ postId }: PostViewBeaconProps) {
  useEffect(() => {
    navigator.sendBeacon(`/api/posts/${postId}/view`, JSON.stringify({ readPercent: 0 }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
