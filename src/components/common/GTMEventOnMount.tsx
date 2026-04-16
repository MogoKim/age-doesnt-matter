'use client'

import { useEffect } from 'react'
import { sendGtmEvent } from '@/lib/gtm'

interface GTMEventOnMountProps {
  event: string
  data: Record<string, unknown>
}

/**
 * 서버 컴포넌트 페이지에서 마운트 시 1회 GA4 이벤트 발생.
 * 예: 일자리 상세, 매거진 상세, 커뮤니티 게시글 조회 추적
 *
 * 이벤트 큐를 통해 gtag 로드 전 마운트돼도 이벤트 유실 없음.
 */
export default function GTMEventOnMount({ event, data }: GTMEventOnMountProps) {
  useEffect(() => {
    sendGtmEvent(event, data)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
