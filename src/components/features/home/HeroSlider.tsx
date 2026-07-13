import { getActiveBanners } from '@/lib/queries/banners'
import { prisma } from '@/lib/prisma'
import { getKstToday } from '@/lib/votes'
import { effectiveVoteStatus } from '@/lib/vote-status'
import VoteWidget from '@/components/features/vote/VoteWidget'
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
  // 오늘의 투표(참여형 이벤트)가 있으면 투표 배너 우선 노출 — 기존 배너 시스템은 무변경 폴백
  try {
    const todayVote = await prisma.voteEvent.findUnique({
      where: { date: getKstToday() },
      select: {
        id: true, question: true, optionA: true, optionB: true, date: true,
        status: true, linkedPostId: true, seedCountA: true, seedCountB: true, displayViews: true,
      },
    })
    if (todayVote) {
      return (
        <section
          className="w-full relative overflow-hidden [aspect-ratio:5/2] lg:[aspect-ratio:8/3]"
          style={{ minHeight: 200 }}
          aria-label="오늘의 투표"
        >
          <VoteWidget
            source="banner"
            initialVote={{
              id: todayVote.id,
              question: todayVote.question,
              optionA: todayVote.optionA,
              optionB: todayVote.optionB,
              // SSR 시점에도 시간 규칙 적용 — 20:00 이후 순간적으로 OPEN처럼 보이는 것 방지
              status: effectiveVoteStatus(todayVote.status, todayVote.date),
              linkedPostId: todayVote.linkedPostId,
              linkedPostUrl: null, // 클라 refetch로 채워짐
              displayA: todayVote.seedCountA,
              displayB: todayVote.seedCountB,
              total: todayVote.seedCountA + todayVote.seedCountB,
              displayViews: todayVote.displayViews,
              myChoice: null,
            }}
          />
        </section>
      )
    }
  } catch {
    // 투표 조회 실패 시 기존 배너로 폴백
  }

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

  return <HeroSliderClient slides={slides} />
}
