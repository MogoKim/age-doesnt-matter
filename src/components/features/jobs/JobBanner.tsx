import Image from 'next/image'

/**
 * JobBanner — 내 일 찾기 상단 띠배너 (11개 중 1개 일 단위 로테이션)
 *
 * - 선택 방식: 날짜 기반(dayOfYear % 11) → SSR 안전, hydration 불일치/CLS 없음, 매일 다른 배너
 * - 비율: 3:1 (2400×800 등) → aspect-[3/1]로 레이아웃 시프트 방지
 * - 자사 브랜드 메시지 배너 → "광고" 라벨 불필요
 */

const BANNER_COUNT = 11

function getDayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start
  return Math.floor(diff / 86_400_000)
}

export default function JobBanner() {
  const index = (getDayOfYear(new Date()) % BANNER_COUNT) + 1
  const src = `/banners/jobs/job-banner-${index}.png`

  return (
    <div className="relative w-full aspect-[3/1] mb-4 overflow-hidden rounded-2xl bg-muted">
      <Image
        src={src}
        alt="우리 나이가 어때서 — 내 일 찾기"
        fill
        sizes="(max-width: 960px) 100vw, 960px"
        className="object-cover"
        priority
      />
    </div>
  )
}
