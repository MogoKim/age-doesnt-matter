import { COUPANG } from './ad-slots'

interface CoupangCategoryBannerProps {
  /** 카테고리: fresh(로켓프레시) / kitchen(로켓주방용품) */
  category: 'fresh' | 'kitchen'
  className?: string
}

const CATEGORY_MAP = {
  fresh: COUPANG.CATEGORY_FRESH,
  kitchen: COUPANG.CATEGORY_KITCHEN,
} as const

/**
 * 쿠팡 카테고리 배너 (이미지 링크)
 * 피드 사이에서 AdSense 인피드와 번갈아 노출
 */
export default function CoupangCategoryBanner({ category, className }: CoupangCategoryBannerProps) {
  const config = CATEGORY_MAP[category]

  return (
    <aside
      className={`relative ${className ?? ''}`}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <a
        href={config.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.imgSrc}
          alt={config.alt}
          width={320}
          height={100}
          className="w-full max-w-[320px] mx-auto rounded-lg"
          loading="lazy"
        />
      </a>
    </aside>
  )
}
