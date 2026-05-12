import { COUPANG } from './ad-slots'

interface Props {
  className?: string
}

export default function CoupangHome2({ className }: Props) {
  const pc = COUPANG.HOME2_PC
  const mobile = COUPANG.HOME2_MOBILE

  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>

      {/* 모바일 320×100 */}
      <div className="flex justify-center lg:hidden">
        <a
          href={mobile.href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          referrerPolicy="unsafe-url"
          aria-label="쿠팡 파트너스"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mobile.imgSrc}
            alt="쿠팡 광고"
            width={mobile.width}
            height={mobile.height}
            loading="lazy"
          />
        </a>
      </div>

      {/* 데스크탑 728×90 */}
      <div className="hidden lg:flex justify-center">
        <a
          href={pc.href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          referrerPolicy="unsafe-url"
          aria-label="쿠팡 파트너스"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pc.imgSrc}
            alt="쿠팡 광고"
            width={pc.width}
            height={pc.height}
            loading="lazy"
          />
        </a>
      </div>

      <p className="text-center text-[8px] text-muted-foreground mt-1">
        이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
