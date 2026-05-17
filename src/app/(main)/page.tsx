import type { Metadata } from 'next'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
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
import MyActivity from '@/components/features/home/MyActivity'
import SignupCard from '@/components/features/home/SignupCard'
import HomeFaqSection from '@/components/features/home/HomeFaqSection'
import {
  getLatestJobs,
  getTrendingCommunityPosts,
  getLatestMagazinePosts,
  getHomeBoardHotPosts,
} from '@/lib/queries/posts'
import { getUserCounts } from '@/lib/queries/home'

export const metadata: Metadata = {
  title: '우리 나이가 어때서 — 5060 세대 커뮤니티',
  description: '50·60대라면 누구나 "여기 오면 내 얘기가 있다"고 느끼는 중장년 연결 커뮤니티. 사는 이야기, 2막 준비, 일자리까지.',
  alternates: { canonical: '/' },
}

// layout.tsx의 auth() 때문에 페이지 레벨 ISR이 무효화됨
// → unstable_cache로 DB 쿼리 자체를 60초 캐싱하여 속도 확보
const getCachedJobs = unstable_cache(
  () => getLatestJobs(5),
  ['home-jobs'],
  { revalidate: 60, tags: ['home-jobs'] }
)
const getCachedTrending = unstable_cache(
  () => getTrendingCommunityPosts(5),
  ['home-trending-community'],
  { revalidate: 60, tags: ['home-trending'] }
)
const getCachedMagazine = unstable_cache(
  () => getLatestMagazinePosts(4),
  ['home-magazine'],
  { revalidate: 60, tags: ['home-magazine'] }
)
const getCachedStoriesRaw = unstable_cache(
  () => getHomeBoardHotPosts('STORY', 10),
  ['home-stories-hot'],
  { revalidate: 60, tags: ['home-stories'] }
)
const getCachedHumorRaw = unstable_cache(
  () => getHomeBoardHotPosts('HUMOR', 10),
  ['home-humor-hot'],
  { revalidate: 60, tags: ['home-humor'] }
)
// 회원 활동 카운트: 알림 배지 수치 → 10s 지연 허용 (매 요청 3× DB count 제거)
const getCachedUserCounts = unstable_cache(
  (userId: string) => getUserCounts(userId),
  ['home-user-counts'],
  { revalidate: 10 }
)

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

// 지금뜨는이야기 + 사는이야기 + 웃음방을 하나의 Suspense로 묶어 trendingIds 중복 제거 보장
async function HotContentSections() {
  const [trendingPosts, storiesRaw, humorRaw] = await Promise.all([
    getCachedTrending(),
    getCachedStoriesRaw(),
    getCachedHumorRaw(),
  ])
  const trendingIds = new Set(trendingPosts.map((p) => p.id))

  const storiesPosts = storiesRaw.filter((p) => !trendingIds.has(p.id)).slice(0, 5)
  const humorPosts = humorRaw.filter((p) => !trendingIds.has(p.id)).slice(0, 5)

  return (
    <>
      <TrendingSection posts={trendingPosts} />

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
        <StoriesSection posts={storiesPosts} />
        <CoupangHome1 className="my-4 mx-4 rounded-2xl overflow-hidden" />
        <HumorSection posts={humorPosts} />
      </div>

      {/* 데스크탑: 2-column 나란히 */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 lg:mt-4">
        <StoriesSection posts={storiesPosts} />
        <HumorSection posts={humorPosts} />
      </div>

      {/* 모바일: IN_FEED / 데스크탑: 쿠팡 728×90 */}
      <ResponsiveAd
        mobile={<FeedAd />}
        desktop={
          <CoupangDesktopBanner className="my-4 rounded-2xl overflow-hidden" />
        }
      />
    </>
  )
}

async function MagazineWrapper() {
  const posts = await getCachedMagazine()
  return <MagazineSection posts={posts} />
}

async function JobWrapper() {
  const jobs = await getCachedJobs()
  return <JobSection jobs={jobs} />
}

async function PersonalGreetingWrapper() {
  const session = await auth()
  if (!session?.user?.nickname) return null
  return <PersonalGreeting nickname={session.user.nickname} />
}

async function MyActivityWrapper() {
  const session = await auth()
  if (!session?.user?.id) return null
  const counts = await getCachedUserCounts(session.user.id)
  return (
    <MyActivity
      todayPosts={counts.todayPosts}
      newComments={counts.newComments}
      receivedLikes={counts.receivedLikes}
    />
  )
}

async function HomeFaqWrapper() {
  const session = await auth()
  if (session?.user) return null
  return <HomeFaqSection />
}

async function SignupCardWrapper() {
  const session = await auth()
  if (session?.user) return null
  return <SignupCard />
}

/* ── 페이지 ── */

export default async function HomePage() {
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
            {/* 회원 전용 인사 카드 */}
            <Suspense fallback={null}>
              <PersonalGreetingWrapper />
            </Suspense>

            {/* 지금뜨는이야기 + 사는이야기 + 웃음방 (trendingIds 중복 제거로 단일 Suspense) */}
            <Suspense fallback={<SectionSkeleton h="min-h-[1400px]" />}>
              <HotContentSections />
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <MagazineWrapper />
            </Suspense>

            {/* 쿠팡 2번 — 모바일 전용 390×150 */}
            <ResponsiveAd
              mobile={<CoupangHome2 className="my-4 mx-4 rounded-2xl overflow-hidden" />}
              desktop={null}
            />

            <Suspense fallback={<SectionSkeleton h="h-[280px]" />}>
              <JobWrapper />
            </Suspense>

            {/* 회원 전용 나의 활동 */}
            <Suspense fallback={null}>
              <MyActivityWrapper />
            </Suspense>

            {/* 비회원 전용 FAQ */}
            <Suspense fallback={null}>
              <HomeFaqWrapper />
            </Suspense>

            {/* 비회원 전용 가입 유도 카드 */}
            <Suspense fallback={null}>
              <SignupCardWrapper />
            </Suspense>

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
