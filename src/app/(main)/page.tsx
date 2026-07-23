import type { Metadata } from 'next'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import dynamic from 'next/dynamic'
import HeroSlider from '@/components/features/home/HeroSlider'
import JobSection from '@/components/features/home/JobSection'
import TrendingSection from '@/components/features/home/TrendingSection'
import StoriesSection from '@/components/features/home/StoriesSection'
import HumorSection from '@/components/features/home/HumorSection'
import NewcomerWelcomeSection from '@/components/features/home/NewcomerWelcomeSection'
import FeedAd from '@/components/ad/FeedAd'
import NativeAdSlot from '@/components/ad/NativeAdSlot'
import ResponsiveAd from '@/components/ad/ResponsiveAd'
import LazyAd from '@/components/ad/LazyAd'
import CoupangHome1 from '@/components/ad/CoupangHome1'
import CoupangHome2 from '@/components/ad/CoupangHome2'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangDesktopBanner from '@/components/ad/CoupangDesktopBanner'
import { ADSENSE } from '@/components/ad/ad-slots'
import MagazineSection from '@/components/features/home/MagazineSection'
// import PersonalGreeting from '@/components/features/home/PersonalGreeting' // 당분간 비활성화(2026-06-17, 홈 회원 인사 카드)
import FirstGreetingWidget from '@/components/features/home/FirstGreetingWidget'
import SignupCard from '@/components/features/home/SignupCard'
import HomeFaqSection from '@/components/features/home/HomeFaqSection'
import {
  getLatestJobs,
  getLatestMagazinePosts,
  getCachedHomeSections,
} from '@/lib/queries/posts'

// 첫 진입 성능(P1): 조건부 모달 팝업 3종은 above-the-fold가 아니므로 클라이언트 지연 로딩(ssr:false)으로
// 초기 번들/hydration에서 제외 → 홈 핵심 콘텐츠 우선 인터랙티브. 팝업 기능·트리거는 그대로(마운트 후 로드).
// (layout.tsx의 PopupRenderer/PushPermissionToast 등과 동일 패턴. 모달이라 CLS 0.)
const VotePopup = dynamic(() => import('@/components/features/vote/VotePopup'), { ssr: false, loading: () => null })
const FeedbackPopup = dynamic(() => import('@/components/features/event/FeedbackPopup'), { ssr: false, loading: () => null })
const SurveyPopup = dynamic(() => import('@/components/features/event/SurveyPopup'), { ssr: false, loading: () => null })

export const metadata: Metadata = {
  // title은 layout.tsx 전역 기본값 사용
  // description은 홈 전용 검색 노출 문구 — 제목 복붙 금지(구글이 무시하고 본문 스니펫 자동생성). 정체성+공감형으로.
  description: '남편·자녀·갱년기·노후… 누구에게도 못 했던 속마음을 또래 여성들과 털어놔요. "나만 이런가" 싶을 때 위로가 되는 따뜻한 커뮤니티.',
  alternates: { canonical: '/' },
}

// ISR: 홈 HTML/RSC를 300초 캐시 → 매 요청 SSR 제거(TTFB↓) + 봇 순회 ISR Writes 절감.
// 글 작성/큐레이션 변경 시 posts.ts의 revalidatePath('/')가 즉시 무효화하므로 콘텐츠 즉시성 유지.
export const revalidate = 300

const getCachedJobs = unstable_cache(
  () => getLatestJobs(5),
  ['home-jobs'],
  { revalidate: 300, tags: ['home-jobs'] }
)
const getCachedMagazine = unstable_cache(
  () => getLatestMagazinePosts(4),
  ['home-magazine'],
  { revalidate: 300, tags: ['home-magazine'] }
)

type HomeSections = Awaited<ReturnType<typeof getCachedHomeSections>>
type HomeMagazinePosts = Awaited<ReturnType<typeof getCachedMagazine>>
type HomeJobs = Awaited<ReturnType<typeof getCachedJobs>>

const EMPTY_HOME_SECTIONS: HomeSections = { trending: [], stories: [], humor: [] }
const EMPTY_HOME_MAGAZINE: HomeMagazinePosts = []
const EMPTY_HOME_JOBS: HomeJobs = []

async function withHomeFallback<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    console.warn(`[home] ${label} fallback used`, error)
    return fallback
  }
}

/* ── Suspense 스켈레톤 ── */
function SectionSkeleton({ h = 'h-[200px]' }: { h?: string }) {
  return <div className={`${h} animate-pulse bg-muted/50 rounded-2xl mx-4 my-3 lg:mx-0`} />
}

function HeroSkeleton() {
  return (
    <div className="w-full [aspect-ratio:5/2] lg:[aspect-ratio:8/3] animate-pulse bg-gradient-to-br from-primary/20 to-primary/10" />
  )
}

/* ── 섹션별 async 서버 컴포넌트 (독립 스트리밍) ── */

// 지금뜨는이야기 + 사는이야기 + 웃음방 — compose 레이어에서 중복 제거 + override 반영
async function HotContentSections() {
  const { trending, stories, humor } = await withHomeFallback(
    'content sections',
    getCachedHomeSections,
    EMPTY_HOME_SECTIONS,
  )

  return (
    <>
      <TrendingSection posts={trending} />

      {/* 모바일: 앱=AdMob Native Advanced(PoC, 홈 인피드 1곳) / 웹=AdSense IN_FEED / 데스크탑: AdSense 728×90 */}
      <ResponsiveAd
        mobile={<NativeAdSlot slotId="home-feed-1" minHeight={230} fallback={<FeedAd />} />}
        desktop={
          <AdSenseUnit
            slotId={ADSENSE.DESKTOP_LEADERBOARD}
            fixedWidth={728}
            fixedHeight={90}
            className="my-4 rounded-2xl overflow-hidden"
          />
        }
      />

      {/* 모바일: 세로 배치 기존 완전 유지 */}
      <div className="block lg:hidden">
        <StoriesSection posts={stories} />
        <LazyAd minHeight={175} className="my-4 mx-4">
          <CoupangHome1 className="rounded-2xl overflow-hidden" />
        </LazyAd>
        <HumorSection posts={humor} />
      </div>

      {/* 데스크탑: 2-column 나란히 */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 lg:mt-4">
        <StoriesSection posts={stories} />
        <HumorSection posts={humor} />
      </div>

      {/* 웃음방 아래 인피드 광고 — 앱=Native Advanced(home-feed-2, 화면당 1개 제한으로 feed-1 점유 시 자동 접힘) / 웹=AdSense */}
      <ResponsiveAd
        mobile={<NativeAdSlot slotId="home-feed-2" minHeight={230} fallback={<FeedAd />} />}
        desktop={null}
      />

      {/* 신입환영 — 웃음방 광고 아래, 모바일/데스크탑 공통 (실유저 환대 2층, Phase 3). 0건이면 null */}
      <Suspense fallback={null}>
        <NewcomerWelcomeSection />
      </Suspense>
    </>
  )
}

async function MagazineWrapper() {
  const posts = await withHomeFallback('magazine section', getCachedMagazine, EMPTY_HOME_MAGAZINE)
  return <MagazineSection posts={posts} />
}

async function JobWrapper() {
  const jobs = await withHomeFallback('job section', getCachedJobs, EMPTY_HOME_JOBS)
  return <JobSection jobs={jobs} />
}

/* ── 페이지 ── */

export default function HomePage() {
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: '우리 나이가 어때서',
    alternateName: '우나어',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com',
    logo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/logo.png`,
    description: '우리 나이가 어때서 — 40대 50대 60대 여성 커뮤니티',
    // [SEO 2026-07-21] "50대 커뮤니티" 쿼리 신호 보강 — 타깃 독자·주제 명시 (화면 비노출)
    audience: {
      '@type': 'PeopleAudience',
      suggestedMinAge: 40,
      suggestedGender: 'female',
      audienceType: '40대·50대·60대 한국 여성',
    },
    knowsAbout: ['갱년기', '노후 준비', '중장년 재취업', '부부·가족 관계', '50대 커뮤니티', '60대 커뮤니티'],
    sameAs: [
      'https://www.threads.com/@age.no.matter',
      'https://www.instagram.com/age.no.matter/',
      'https://www.facebook.com/profile.php?id=61590818695710',
      'https://blog.naver.com/age-doesnt-matter',
      'https://play.google.com/store/apps/details?id=com.agenotmatter.app',
    ],
  }

  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '우리 나이가 어때서',
    alternateName: '우나어',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com',
    description: '40대·50대·60대 여성들이 모여 이야기 나누는 또래 커뮤니티',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <>
      <div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
        <h1 className="sr-only">우리 나이가 어때서 — 40대 50대 60대 여성 커뮤니티</h1>
        <div className="max-w-[1200px] mx-auto">
          <Suspense fallback={<HeroSkeleton />}>
            <HeroSlider />
          </Suspense>

          {/* 오늘의 투표 입구 바텀시트 — 미투표자 하루 1회, 선택 즉시 게시글 이동(결과 미표시), 어드민 팝업 양보 */}
          <VotePopup />
          {/* 의견수렴형 이벤트 입구 바텀시트 (Phase 3b) — VOTE와 배타(서버 getExposedEvent 1개), 하루 1회, 어드민 팝업 양보 */}
          <FeedbackPopup />
          {/* 1분 의견함(SURVEY) 입구 바텀시트 (Phase 5) — VOTE/FEEDBACK과 배타, 하루 1회, 입구만(설문 폼 없음) */}
          <SurveyPopup />

          <div className="lg:px-8">
            {/* 첫 인사 위젯 (client island — 가입 72h 이내·미작성 회원만, useAppSession 판별) */}
            <FirstGreetingWidget />
            {/* 회원 인사 카드 — 2026-06-17 창업자 요청으로 당분간 비활성화
                (가입=이미 둘러볼 의지 있음 + 첫인사 위젯과 환영 톤 중복). 재개 시 위 import와 함께 주석 해제 */}
            {/* <PersonalGreeting /> */}

            {/* 지금뜨는이야기 + 사는이야기 + 웃음방 (trendingIds 중복 제거로 단일 Suspense) */}
            <Suspense fallback={<SectionSkeleton h="min-h-[1400px]" />}>
              <HotContentSections />
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <MagazineWrapper />
            </Suspense>

            {/* 쿠팡 2번 — 모바일 390×150 / 데스크탑 728×90 */}
            <ResponsiveAd
              mobile={
                <LazyAd minHeight={175} className="my-4 mx-4">
                  <CoupangHome2 className="rounded-2xl overflow-hidden" />
                </LazyAd>
              }
              desktop={<CoupangDesktopBanner className="my-4 rounded-2xl overflow-hidden" />}
            />

            <Suspense fallback={<SectionSkeleton h="h-[280px]" />}>
              <JobWrapper />
            </Suspense>

            {/* 비회원 전용 FAQ (클라이언트, useSession) */}
            <HomeFaqSection />

            {/* 비회원 전용 가입 유도 카드 (클라이언트, useSession) */}
            <SignupCard />

            {/* 데스크탑 전용 하단 AdSense 728×250 (회원/비회원 공통) */}
            <ResponsiveAd
              mobile={null}
              desktop={
                <AdSenseUnit
                  slotId={ADSENSE.DESKTOP_BOTTOM}
                  fixedWidth={728}
                  fixedHeight={250}
                  className="my-6 rounded-2xl overflow-hidden mx-auto"
                />
              }
            />
          </div>
        </div>
      </div>
    </>
  )
}
