import { getActiveBanners } from '@/lib/queries/banners'
import { prisma } from '@/lib/prisma'
import { getKstToday, resolveLinkedPostUrl } from '@/lib/votes'
import { effectiveVoteStatus } from '@/lib/vote-status'
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

/** 오늘의 투표 슬라이드 — 5:2 안 직접투표 미니 투표판 (VoteHeroSlide가 렌더).
 *  myChoice/집계는 클라 fetch로만 — 홈 ISR(60s) 캐시에 사용자별 값이 섞이면 안 됨. */
async function buildVoteTeaserSlide(): Promise<SlideData | null> {
  try {
    const todayVote = await prisma.voteEvent.findUnique({
      where: { date: getKstToday() },
      select: { id: true, question: true, optionA: true, optionB: true, date: true, status: true, linkedPostId: true },
    })
    if (!todayVote) return null

    const closed = effectiveVoteStatus(todayVote.status, todayVote.date) === 'CLOSED'
    const linkedPostUrl = await resolveLinkedPostUrl(todayVote.linkedPostId)

    return {
      id: `vote-teaser-${todayVote.id}`,
      title: todayVote.question,
      subtitle: closed ? '오늘의 투표 — 결과가 나왔어요' : '오늘의 투표 — 밤 8시 마감',
      themeColor: '#E85D50',
      themeColorMid: '#FF6F61',
      themeColorEnd: '#FF9E8C',
      ctaText: closed ? '결과 보러가기' : '투표하러 가기',
      // linkedPostUrl 없으면 커뮤니티 목록 fallback (어드민 통제판에 누락 경고 표시됨)
      ctaUrl: linkedPostUrl ?? '/community/stories',
      vote: {
        id: todayVote.id,
        question: todayVote.question,
        optionA: todayVote.optionA,
        optionB: todayVote.optionB,
        status: closed ? 'CLOSED' : 'OPEN',
        linkedPostUrl,
      },
    }
  } catch {
    return null
  }
}

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
        imageUrl: b.imageUrl && b.imageUrl.length > 0 ? b.imageUrl : undefined,
      }))
    } else {
      slides = FALLBACK_SLIDES
    }
  } catch {
    slides = FALLBACK_SLIDES
  }

  // 오늘의 투표 teaser — 기존 배너를 유지하고 3번째 위치에 삽입 (배너가 2개 미만이면 맨 뒤)
  const voteSlide = await buildVoteTeaserSlide()
  if (voteSlide) {
    slides = [...slides.slice(0, 2), voteSlide, ...slides.slice(2)]
  }

  return <HeroSliderClient slides={slides} />
}
