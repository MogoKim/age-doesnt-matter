'use client'

import { COUPANG } from './ad-slots'

interface CoupangBannerProps {
  /** 배너 프리셋: mobile(320x100) / desktop(300x250) / product(320x250) */
  preset: 'mobile' | 'desktop' | 'product'
  className?: string
}

const PRESET_MAP = {
  mobile: { src: COUPANG.IFRAME_MOBILE, width: 320, height: 100 },
  desktop: { src: COUPANG.IFRAME_DESKTOP, width: 300, height: 250 },
  product: { src: COUPANG.IFRAME_PRODUCT, width: 320, height: 250 },
} as const

export default function CoupangBanner({ preset, className }: CoupangBannerProps) {
  const config = PRESET_MAP[preset]
  if (!config.src) return null

  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div className="flex justify-center">
        <iframe
          src={config.src}
          width={config.width}
          height={config.height}
          frameBorder="0"
          scrolling="no"
          loading="lazy"
          style={{ border: 'none' }}
        />
      </div>
    </aside>
  )
}
