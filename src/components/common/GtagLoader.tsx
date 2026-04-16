'use client'

import Script from 'next/script'
import { markGtagReady } from '@/lib/gtm'

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID

/**
 * gtag.js 외부 스크립트 로더 (Client Component)
 *
 * onLoad 핸들러가 필요해 Client Component로 분리.
 * GoogleTagManager.tsx는 Server Component로 유지해야 하므로 여기서 처리.
 * 로드 완료 시 markGtagReady()로 이벤트 큐 플러시.
 */
export default function GtagLoader() {
  if (!GA4_ID) return null
  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
      strategy="afterInteractive"
      onLoad={markGtagReady}
    />
  )
}
