/* eslint-disable @typescript-eslint/no-unused-vars -- [DIAG-3] 임시 진단 커밋. 홈 본문을 정적 마커로 교체해 hydration 원인을 이분 탐색한다. 최종 diff 에서 전부 제거한다. */
import type { Metadata } from 'next'
import HomePopupsClientOnly from '@/components/features/event/HomePopupsClientOnly'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
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

/* ── 섹션별 async 서버 컴포넌트 (독립 스트리밍) ── */

// 지금뜨는이야기 + 사는이야기 + 웃음방 — compose 레이어에서 중복 제거 + override 반영
async function HotContentSections() {
  const { trending, stories, humor } = await withHomeFallback(
    'content sections',
    getCachedHomeSections,
    EMPTY_HOME_SECTIONS,
  )

  return (
    <div className="min-h-[1400px]">
      <TrendingSection posts={trending} />

      {/* 모바일: 앱=AdMob Native Advanced(PoC, 홈 인피드 1곳) / 웹=AdSense IN_FEED / 데스크탑: AdSense 728×90 */}
      <ResponsiveAd
        mobilePlaceholderHeight={282}
        desktopPlaceholderHeight={122}
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
        mobilePlaceholderHeight={282}
        mobile={<NativeAdSlot slotId="home-feed-2" minHeight={230} fallback={<FeedAd />} />}
        desktop={null}
      />

      {/* 신입환영 — 웃음방 광고 아래, 모바일/데스크탑 공통 (실유저 환대 2층, Phase 3). 0건이면 null */}
      <Suspense fallback={null}>
        <NewcomerWelcomeSection />
      </Suspense>
    </div>
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
    description: '우리 나이가 어때서 — 40대 50대 여성 커뮤니티',
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
        {/* [DIAG-3] organizationJsonLd script 도 제거 — 홈을 완전 정적으로 */}
        {/* [DIAG-2] webSiteJsonLd script 제거 — potentialAction.target 의 {search_term_string} 중괄호 검증 */}
        <h1 className="sr-only">우리 나이가 어때서 — 40대 50대 여성 커뮤니티</h1>
        {/* [DIAG-1] 홈 본문 전체를 정적 마커로 교체 — hydration 원인 이분 탐색. 최종 diff 에서 제거한다. */}
        <div className="max-w-[1200px] mx-auto">
          <p data-diag="home-body-replaced">DIAG-1</p>
        </div>
      </div>
    </>
  )
}
