'use client'

import { useIsDesktop } from '@/hooks/use-media-query'

interface ResponsiveAdProps {
  mobile: React.ReactNode
  desktop: React.ReactNode
}

export default function ResponsiveAd({ mobile, desktop }: ResponsiveAdProps) {
  const isDesktop = useIsDesktop()
  return <>{isDesktop ? desktop : mobile}</>
}
