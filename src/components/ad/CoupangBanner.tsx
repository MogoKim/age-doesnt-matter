'use client'

import Image from 'next/image'
import { COUPANG } from './ad-slots'

interface CoupangBannerProps {
  /** 배너 프리셋: mobile(320x100) / desktop(300x250) */
  preset: 'mobile' | 'desktop'
  className?: string
}

/**
 * 쿠팡 CPS 배너 — 정적 이미지 + 어필리에이트 링크
 * 외부 JS SDK 의존성 없음 → 한 번 설정하면 깨질 일 없음
 * 모바일: 카테고리 배너 2종 랜덤 로테이션 (320x100)
 * 데스크탑: 카테고리 배너 2종 랜덤 로테이션 (320x100, 컨테이너 중앙 정렬)
 */

const BANNERS = [COUPANG.CATEGORY_FRESH, COUPANG.CATEGORY_KITCHEN] as const

function pickBanner() {
  // 시간 기반 로테이션 — 같은 시간대에는 같은 배너 표시 (hydration mismatch 방지)
  const hourSlot = new Date().getHours()
  return BANNERS[hourSlot % BANNERS.length]
}

export default function CoupangBanner({ preset, className }: CoupangBannerProps) {
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
            unoptimized
          />
        </a>
      </div>
      <p className="text-center text-[11px] text-muted-foreground mt-1">
        이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </aside>
  )
}
