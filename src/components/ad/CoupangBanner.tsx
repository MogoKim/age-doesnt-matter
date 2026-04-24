import Image from 'next/image'
import { COUPANG } from './ad-slots'

interface CoupangBannerProps {
  /** 배너 프리셋: mobile(320x100) / desktop(300x100) / leaderboard(728x90) / electronics(320x100) */
  preset: 'mobile' | 'desktop' | 'leaderboard' | 'electronics'
  className?: string
}

/**
 * 쿠팡 CPS 배너 (v2 — 서버 컴포넌트화)
 *
 * 이전 버전 문제:
 * - 'use client' + new Date().getHours() → 서버(UTC) vs 클라이언트(KST) 시간대 불일치 → hydration mismatch
 *
 * v2 변경:
 * - 서버 컴포넌트 (use client 제거) → hydration mismatch 원천 차단
 * - 날짜 기반 로테이션 (시간대 무관)
 * - next/image는 서버 컴포넌트에서 사용 가능
 */

const BANNERS = [COUPANG.CATEGORY_FRESH, COUPANG.CATEGORY_KITCHEN] as const

function pickBanner() {
  // 날짜 기반 로테이션 — UTC 기준 날짜로 시간대 불일치 제거
  const day = new Date().getUTCDate()
  return BANNERS[day % BANNERS.length]
}

export default function CoupangBanner({ preset, className }: CoupangBannerProps) {
  // electronics / leaderboard 배너 — 외부 동적 URL 사용
  if (preset === 'electronics' || preset === 'leaderboard') {
    const slot = preset === 'electronics' ? COUPANG.CATEGORY_ELECTRONICS : COUPANG.LEADERBOARD
    return (
      <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
        <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
          광고
        </span>
        <a
          href={slot.href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          referrerPolicy="unsafe-url"
          aria-label="쿠팡 파트너스"
          className="block w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.imgSrc}
            alt="쿠팡 광고"
            width={slot.width}
            height={slot.height}
            loading="lazy"
            className="w-full h-auto"
          />
        </a>
        <p className="text-center text-[11px] text-muted-foreground mt-1">
          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </p>
      </aside>
    )
  }

  const banner = pickBanner()

  const width = preset === 'mobile' ? 320 : 300
  const height = preset === 'mobile' ? 100 : 100

  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>
      <div className="flex justify-center">
        <a
          href={banner.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label={`쿠팡 ${banner.alt}`}
        >
          <Image
            src={banner.imgSrc}
            alt={banner.alt}
            width={width}
            height={height}
            loading="lazy"
          />
        </a>
      </div>
      <p className="text-center text-[11px] text-muted-foreground mt-1">
        이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
