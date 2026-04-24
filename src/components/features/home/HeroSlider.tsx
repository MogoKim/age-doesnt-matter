import { getActiveBanners } from '@/lib/queries/banners'
import HeroSliderClient, { type SlideData } from './HeroSliderClient'

/** 하드코딩 폴백 — DB에 배너 없을 때 사용 (이미지 업로드 전 임시 단색 표시) */
const FALLBACK_SLIDES: SlideData[] = [
  {
    id: 'fallback-1',
    title: '',
    ctaHref: '/about',
    bgColor: 'var(--hero-slide-1)',
  },
  {
    id: 'fallback-2',
    title: '',
    ctaHref: '/community/stories',
    bgColor: 'var(--hero-slide-2)',
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
