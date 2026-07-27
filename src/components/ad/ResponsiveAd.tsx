'use client'

import { useEffect, useState, type ReactNode } from 'react'

interface ResponsiveAdProps {
  mobile: ReactNode
  desktop: ReactNode
}

/**
 * 실제 viewport에 맞는 광고만 mount한다.
 *
 * CSS hide 방식은 모바일에서도 데스크탑 iframe이 만들어질 수 있어 첫 진입 네트워크를
 * 잡아먹었다. hydration 전에는 아무 광고도 mount하지 않고, matchMedia 판정 후
 * 한쪽 branch만 렌더한다.
 */
export default function ResponsiveAd({ mobile, desktop }: ResponsiveAdProps) {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  if (isDesktop === null) return null
  if (isDesktop) return desktop ? <div>{desktop}</div> : null
  return mobile ? <div>{mobile}</div> : null
}
