import Image from 'next/image'
import Link from 'next/link'

/**
 * JobPostBanner — 일자리 게시글 상세 상단 자사 홍보 배너 (제목 위)
 *
 * - 선택 방식: 게시글 id 해시(seed) → 11개 중 1개 고정 배정
 *   → 게시글마다 다른 배너(전체 골고루 노출), 같은 글은 항상 같은 배너 → SSR/ISR 안전, CLS 없음
 * - 클릭 시 홈('/')으로 이동
 * - 비율 3:1 (2400×800) → aspect-[3/1]로 레이아웃 시프트 방지
 * - 자사 브랜드 메시지 배너 → "광고" 라벨 불필요
 */

const BANNER_COUNT = 11

function pickIndex(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return (h % BANNER_COUNT) + 1
}

export default function JobPostBanner({ seed }: { seed: string }) {
  const index = pickIndex(seed)
  const src = `/banners/jobs/job-banner-${index}.png`

  return (
    <Link
      href="/"
      aria-label="우리 나이가 어때서 홈으로 가기"
      className="block relative w-full aspect-[3/1] mb-4 overflow-hidden rounded-2xl bg-muted"
    >
      <Image
        src={src}
        alt="우리 나이가 어때서"
        fill
        sizes="(max-width: 720px) 100vw, 720px"
        className="object-cover"
        priority
      />
    </Link>
  )
}
