'use client'

import { useEffect } from 'react'
import { getBrowserEnv } from '@/lib/gtm'

/**
 * Web Vitals RUM 수집 (저사양 성능 측정용)
 * - 페이지 로드당 10% 샘플링 (한 번 결정 → 그 페이지 지표는 일관 전송)
 * - 기존 /api/events(EventLog) 재사용, eventName='web_vital'
 * - 봇/내부 트래픽 필터는 서버(/api/events)가 처리
 * - 핵심 지표(LCP/INP/CLS/TTFB)만 1회씩 전송 → 페이지당 과도 전송 방지
 */
export default function WebVitalsReporter() {
  useEffect(() => {
    // 10% 샘플링
    if (Math.random() >= 0.1) return

    const uaCategory = (() => {
      try {
        return getBrowserEnv()
      } catch {
        return 'unknown'
      }
    })()
    const nav = navigator as unknown as {
      connection?: { effectiveType?: string }
      deviceMemory?: number
    }
    const effectiveType = nav.connection?.effectiveType ?? null
    const deviceMemory = nav.deviceMemory ?? null

    const send = (metric: { name: string; value: number; rating?: string }) => {
      try {
        const body = JSON.stringify({
          eventName: 'web_vital',
          path: location.pathname,
          properties: {
            metric: metric.name,
            value: Math.round(metric.value * 1000) / 1000, // CLS 같은 소수 보존
            rating: metric.rating ?? null,
            effectiveType,
            deviceMemory,
            uaCategory,
          },
        })
        navigator.sendBeacon?.('/api/events', body)
      } catch {
        /* RUM 실패는 무시 */
      }
    }

    let cancelled = false
    import('web-vitals')
      .then((wv) => {
        if (cancelled) return
        wv.onLCP(send)
        wv.onINP(send)
        wv.onCLS(send)
        wv.onTTFB(send)
      })
      .catch(() => {
        /* web-vitals 로드 실패 무시 */
      })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
