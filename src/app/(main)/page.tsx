import type { Metadata } from 'next'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import HeroSlider from '@/components/features/home/HeroSlider'
import JobSection from '@/components/features/home/JobSection'
import TrendingSection from '@/components/features/home/TrendingSection'
import StoriesSection from '@/components/features/home/StoriesSection'
import HumorSection from '@/components/features/home/HumorSection'
import FeedAd from '@/components/ad/FeedAd'
import ResponsiveAd from '@/components/ad/ResponsiveAd'
import CoupangHome1 from '@/components/ad/CoupangHome1'
import CoupangHome2 from '@/components/ad/CoupangHome2'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangDesktopBanner from '@/components/ad/CoupangDesktopBanner'
import { ADSENSE } from '@/components/ad/ad-slots'
import MagazineSection from '@/components/features/home/MagazineSection'
import PersonalGreeting from '@/components/features/home/PersonalGreeting'
import SignupCard from '@/components/features/home/SignupCard'
import HomeFaqSection from '@/components/features/home/HomeFaqSection'
import {
  getLatestJobs,
  getLatestMagazinePosts,
  getCachedHomeSections,
} from '@/lib/queries/posts'

export const metadata: Metadata = {
  title: '우리 나이가 어때서 — 5060 세대 커뮤니티',
  description: '50·60대라면 누구나 "여기 오면 내 얘기가 있다"고 느끼는 중장년 연결 커뮤니티. 사는 이야기, 2막 준비, 일자리까지.',
  alternates: { canonical: '/' },
}

const getCachedJobs = unstable_cache(
  () => getLatestJobs(5),
  ['home-jobs'],
  { revalidate: 60, tags: ['home-jobs'] }
)
const getCachedMagazine = unstable_cache(
  () => getLatestMagazinePosts(4),
  ['home-magazine'],
  { revalidate: 60, tags: ['home-magazine'] }
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

      {/* 모바일: IN_FEED / 데스크탑: AdSense 728×90 */}
      <ResponsiveAd
        mobile={<FeedAd />}
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
        <CoupangHome1 className="my-4 mx-4 rounded-2xl overflow-hidden" />
        <HumorSection posts={humor} />
      </div>

      {/* 데스크탑: 2-column 나란히 */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 lg:mt-4">
        <StoriesSection posts={stories} />
        <HumorSection posts={humor} />
      </div>

      {/* 모바일: IN_FEED (데스크탑 쿠팡 → 매거진 아래로 이동) */}
      <ResponsiveAd
        mobile={<FeedAd />}
        desktop={null}
      />
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
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com',
    logo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/logo-512.png`,
    description: '50·60대가 나이 걱정 없이 일자리와 소통을 찾는 따뜻한 커뮤니티',
    sameAs: [
      'https://www.threads.net/@unaeo_official',
      'https://x.com/unaeo_official',
      'https://www.instagram.com/unaeo_official',
      'https://www.facebook.com/unaeo.official',
    ],
  }

  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '우리 나이가 어때서',
    alternateName: '우나어',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/search?q={search_term_string}`,
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
        <h1 className="sr-only">우리 나이가 어때서 — 5060 세대 커뮤니티</h1>
        <div className="max-w-[1200px] mx-auto">
          <Suspense fallback={<HeroSkeleton />}>
            <HeroSlider />
          </Suspense>

          <div className="lg:px-8">
            {/* 회원 전용 인사 카드 (클라이언트, useSession) */}
            <PersonalGreeting />

            {/* 지금뜨는이야기 + 사는이야기 + 웃음방 (trendingIds 중복 제거로 단일 Suspense) */}
            <Suspense fallback={<SectionSkeleton h="min-h-[1400px]" />}>
              <HotContentSections />
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <MagazineWrapper />
            </Suspense>

            {/* 쿠팡 2번 — 모바일 390×150 / 데스크탑 728×90 */}
            <ResponsiveAd
              mobile={<CoupangHome2 className="my-4 mx-4 rounded-2xl overflow-hidden" />}
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
