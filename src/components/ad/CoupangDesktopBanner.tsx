import { COUPANG } from './ad-slots'

interface Props {
  className?: string
}

export default function CoupangDesktopBanner({ className }: Props) {
  const { iframeSrc, width, height } = COUPANG.DESKTOP_BANNER
  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-[10px] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div className="flex justify-center overflow-hidden">
        <iframe
          src={iframeSrc}
          width={width}
          height={height}
          frameBorder={0}
          scrolling="no"
          referrerPolicy="unsafe-url"
          title="쿠팡 파트너스 광고"
        />
      </div>
      <p className="text-center text-[8px] text-muted-foreground mt-1">
        이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
