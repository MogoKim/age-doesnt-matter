'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trackEvent } from '@/lib/track'
import { gtmPageView } from '@/lib/gtm'

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // 기존 내부 EventLog 트래킹
    trackEvent('page_view')
    // GTM dataLayer → GA4 page_view
    gtmPageView(pathname)
  }, [pathname])

  return null
}
