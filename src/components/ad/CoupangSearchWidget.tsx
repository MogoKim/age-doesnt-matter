import { COUPANG } from './ad-slots'

interface CoupangSearchWidgetProps {
  className?: string
}

/**
 * 쿠팡 검색 위젯 (iframe)
 * 글 상세 하단에 배치 — 데스크탑(75px) + 모바일(44px) 반응형
 */
export default function CoupangSearchWidget({ className }: CoupangSearchWidgetProps) {
  return (
    <aside
      className={`relative ${className ?? ''}`}
      role="complementary"
      aria-label="광고"
    >
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      {/* 데스크탑: 큰 검색바 */}
      <div className="hidden lg:block">
        <iframe
          src={COUPANG.SEARCH_DESKTOP}
          width="100%"
          height={75}
          frameBorder={0}
          scrolling="no"
          referrerPolicy="unsafe-url"
          title="쿠팡 검색"
          loading="lazy"
        />
      </div>
      {/* 모바일: 작은 검색바 */}
      <div className="block lg:hidden">
        <iframe
          src={COUPANG.SEARCH_MOBILE}
          width="100%"
          height={44}
          frameBorder={0}
          scrolling="no"
          referrerPolicy="unsafe-url"
          title="쿠팡 검색"
          loading="lazy"
        />
      </div>
    </aside>
  )
}
