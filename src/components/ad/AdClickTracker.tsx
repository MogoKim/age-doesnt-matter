'use client'

import { gtmAdClick } from '@/lib/gtm'

interface AdClickTrackerProps {
  adId: string
  adType?: string
  children: React.ReactNode
}

export default function AdClickTracker({ adId, adType = 'display', children }: AdClickTrackerProps) {
  function handleClick() {
    gtmAdClick(adId, adType)
    fetch('/api/ad-click', {
      method: 'POST',
      body: JSON.stringify({ adId }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})
  }

  return <div onClick={handleClick}>{children}</div>
}
