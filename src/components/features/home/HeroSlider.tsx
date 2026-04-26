import { getActiveBanners } from '@/lib/queries/banners'
import HeroSliderClient, { type SlideData } from './HeroSliderClient'

/** 폴백 슬라이드 — DB 배너 없을 때 (그라디언트 CSS 변수 기반) */
const FALLBACK_SLIDES: SlideData[] = [
  {
    id: 'fallback-1',
    title: '우리 또래끼리\n나이 걱정 없이',
    subtitle: '50·60대 커뮤니티, 우나어',
    themeColor: '#C4453B',
    themeColorMid: '#FF6F61',
    themeColorEnd: '#FFB4A2',
    ctaText: '시작하기',
    ctaUrl: '/about',
  },
  {
    id: 'fallback-2',
    title: '사는 이야기\n함께 나눠요',
    subtitle: '공감이 넘치는 소통 공간',
    themeColor: '#C7651E',
    themeColorMid: '#E89456',
    themeColorEnd: '#FAC775',
    ctaText: '이야기 보러가기',
    ctaUrl: '/community/stories',
  },
  {
    id: 'fallback-3',
    title: '인생 2막\n같이 준비해요',
    subtitle: '일자리부터 재취업까지',
    themeColor: '#1B5E20',
    themeColorMid: '#4A8C3A',
    themeColorEnd: '#97C459',
    ctaText: '내일 찾기',
    ctaUrl: '/jobs',
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
        subtitle: b.subtitle ?? undefined,
        themeColor: b.themeColor,
        themeColorMid: b.themeColorMid ?? undefined,
        themeColorEnd: b.themeColorEnd ?? undefined,
        ctaText: b.ctaText ?? undefined,
        ctaUrl: b.ctaUrl ?? '/',
      }))
    } else {
      slides = FALLBACK_SLIDES
    }
  } catch {
    slides = FALLBACK_SLIDES
  }

  return <HeroSliderClient slides={slides} />
}
