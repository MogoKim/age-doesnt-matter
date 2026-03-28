'use client'

import { useEffect } from 'react'

interface GTMEventOnMountProps {
  event: string
  data: Record<string, unknown>
}

/**
 * 서버 컴포넌트 페이지에서 마운트 시 1회 GA4 이벤트 발생.
 * 예: 일자리 상세, 매거진 상세 조회 추적
 */
export default function GTMEventOnMount({ event, data }: GTMEventOnMountProps) {
  useEffect(() => {
    if (window.gtag) {
      window.gtag('event', event, data)
    }
  }, [event, data])

  return null
}
