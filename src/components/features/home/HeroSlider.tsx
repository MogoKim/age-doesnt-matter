import { getActiveBanners } from '@/lib/queries/banners'
import { prisma } from '@/lib/prisma'
import { resolveLinkedPostUrl } from '@/lib/votes'
import { effectiveVoteStatus } from '@/lib/vote-status'
import { resolveChannelVote, getExposedFeedback } from '@/lib/events/exposure'
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
 *  myChoice/집계는 클라 fetch로만 — 홈 ISR(60s) 캐시에 사용자별 값이 섞이면 안 됨.
 *  Phase 2: 노출 대상은 Event 오케스트레이션 계층(resolveChannelVote('hero'))이 선택.
 *   - hero 채널 Event(VOTE) 노출 중이면 그 voteEventId / Event 없는 날은 오늘 투표로 fallback.
 *   - showHero=false·tier≠PRIMARY·isActive=false·window 밖이면 null → 티저 미노출.
 *   - OPEN/CLOSED 렌더는 기존 effectiveVoteStatus가 담당(투표 마감 20:00과 채널 노출 종료 분리). */
async function buildVoteTeaserSlide(): Promise<SlideData | null> {
  try {
    const showVoteId = await resolveChannelVote('hero')
    if (!showVoteId) return null

    const todayVote = await prisma.voteEvent.findUnique({
      where: { id: showVoteId },
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

/** 의견수렴형(FEEDBACK) HERO 슬라이드 — Phase 3b.
 *  getExposedFeedback('hero')(PRIMARY·showHero·window)가 있으면 **vote 필드 없는 일반 배너 슬라이드**로 렌더.
 *   - HeroSliderClient가 slide.vote 없으면 일반 CTA 배너 → 클릭 시 /events/[eventId] 이동. VoteHeroSlide 무접촉.
 *   - 투표 버튼/결과/카운트 없음. VOTE와 배타(getExposedEvent 채널당 1개, 호출부에서 voteSlide 우선). */
async function buildFeedbackTeaserSlide(): Promise<SlideData | null> {
  try {
    const fb = await getExposedFeedback('hero')
    if (!fb) return null
    return {
      id: `feedback-teaser-${fb.eventId}`,
      title: fb.title,
      subtitle: fb.description ?? '여러분의 의견을 들려주세요',
      themeColor: '#5B4B8A',
      themeColorMid: '#7C6BB0',
      themeColorEnd: '#A99BD6',
      ctaText: '의견 남기러 가기',
      ctaUrl: `/events/${fb.eventId}`,
      // vote 필드 없음 → 일반 배너 슬라이드(투표 위젯 아님)
    }
  } catch {
    return null
  }
}

// ⚠️ SURVEY HERO 슬라이드는 **서버에서 만들지 않는다.**
//  홈은 revalidate=300 ISR 서버 컴포넌트라 audience(로그인 여부)를 모른 채 캐시된다 →
//  회원용 설문이 비회원에게 새는 문제. 그래서 SURVEY HERO는 HeroSliderClient(클라이언트)가
//  마운트 시 /api/events/exposed?channel=hero (세션 포함, no-store) fetch로 audience별로 삽입한다.
//  VOTE/FEEDBACK HERO는 audience=ALL 전용이라 기존대로 서버 렌더 유지(회귀 0).

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

  // 참여 이벤트 teaser(서버) — VOTE 우선 → FEEDBACK(둘 다 audience=ALL). 3번째 위치 삽입.
  //  SURVEY(audience 분리)는 여기서 넣지 않고 HeroSliderClient가 세션 기준 client fetch로 삽입.
  const voteSlide = await buildVoteTeaserSlide()
  const teaser = voteSlide ?? (await buildFeedbackTeaserSlide())
  if (teaser) {
    slides = [...slides.slice(0, 2), teaser, ...slides.slice(2)]
  }
  // hasServerTeaser=true면 client survey 삽입을 생략(같은 슬롯 중복 방지 — 충돌가드로 실제 공존은 없지만 방어).
  return <HeroSliderClient slides={slides} allowSurveyIsland={!teaser} />
}
