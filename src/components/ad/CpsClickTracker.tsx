'use client'

import { gtmCpsClick } from '@/lib/gtm'

interface CpsClickTrackerProps {
  productName: string
  category: string
  children: React.ReactNode
}

export default function CpsClickTracker({ productName, category, children }: CpsClickTrackerProps) {
  function handleClick() {
    gtmCpsClick(productName, category)
  }

  return <div onClick={handleClick}>{children}</div>
}
