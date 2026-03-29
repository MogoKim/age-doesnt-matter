import { getActiveBanners } from '@/lib/queries/banners'
import HeroSliderClient, { type SlideData } from './HeroSliderClient'

/** 하드코딩 폴백 — DB에 배너 없을 때 사용 */
const FALLBACK_SLIDES: SlideData[] = [
  {
    id: 'fallback-1',
    title: '당신의\n두 번째 전성기',
    ctaText: '일자리 보기',
    ctaHref: '/jobs',
    bgColor: 'var(--hero-slide-1)',
  },
  {
    id: 'fallback-2',
    title: '같은 세대의\n따뜻한 이야기',
    ctaText: '커뮤니티 가기',
    ctaHref: '/community/stories',
    bgColor: 'var(--hero-slide-2)',
  },
  {
    id: 'fallback-3',
    title: '건강하고 활기찬\n매일을 함께',
    ctaText: '매거진 읽기',
    ctaHref: '/magazine',
    bgColor: 'var(--hero-slide-3)',
  },
]

export default async function HeroSlider() {
  let slides: SlideData[]

  try {
    const banners = await getActiveBanners()

    if (banners.length > 0) {
      slides = banners.map((b) => ({
        id: b.id,
        title: b.title,
        ctaText: b.description ?? undefined,
        ctaHref: b.linkUrl ?? '/',
        imageUrl: b.imageUrl,
      }))
    } else {
      slides = FALLBACK_SLIDES
    }
  } catch {
    slides = FALLBACK_SLIDES
  }

  return <HeroSliderClient slides={slides} />
}
