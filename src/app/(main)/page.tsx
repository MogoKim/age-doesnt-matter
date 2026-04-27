import type { Metadata } from 'next'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
import HeroSlider from '@/components/features/home/HeroSlider'
import JobSection from '@/components/features/home/JobSection'
import TrendingSection from '@/components/features/home/TrendingSection'
import FeedAd from '@/components/ad/FeedAd'
import CoupangBanner from '@/components/ad/CoupangBanner'
import CoupangCarousel from '@/components/ad/CoupangCarousel'
import ResponsiveAd from '@/components/ad/ResponsiveAd'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import { ADSENSE } from '@/components/ad/ad-slots'
import MagazineSection from '@/components/features/home/MagazineSection'
import CommunitySection from '@/components/features/home/CommunitySection'
import Life2Section from '@/components/features/home/Life2Section'
import HomeSidebar from '@/components/features/home/HomeSidebar'
import PersonalGreeting from '@/components/features/home/PersonalGreeting'
import MyActivity from '@/components/features/home/MyActivity'
import ActivityPulse from '@/components/features/home/ActivityPulse'
import SignupCard from '@/components/features/home/SignupCard'
import {
  getLatestJobs,
  getTrendingPosts,
  getLatestMagazinePosts,
  getLatestCommunityPosts,
  getLatestLife2Posts,
} from '@/lib/queries/posts'
import { getUserCounts, getActivityPulseData } from '@/lib/queries/home'

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
  { revalidate: 60 }
)
const getCachedTrending = unstable_cache(
  () => getTrendingPosts(5),
  ['home-trending'],
  { revalidate: 60 }
)
const getCachedMagazine = unstable_cache(
  () => getLatestMagazinePosts(4),
  ['home-magazine'],
  { revalidate: 60 }
)
const getCachedCommunity = unstable_cache(
  () => getLatestCommunityPosts(5),
  ['home-community'],
  { revalidate: 60 }
)
const getCachedLife2 = unstable_cache(
  () => getLatestLife2Posts(5),
  ['home-life2'],
  { revalidate: 60 }
)
const getCachedActivityPulse = unstable_cache(
  () => getActivityPulseData(),
  ['home-activity-pulse'],
  { revalidate: 60 }
)

/* ── Suspense 스켈레톤 ── */
function SectionSkeleton({ h = 'h-[200px]' }: { h?: string }) {
  return <div className={`${h} animate-pulse bg-muted/50 rounded-2xl mx-4 my-3`} />
}

/* ── 섹션별 async 서버 컴포넌트 (독립 스트리밍) ── */

async function TrendingWrapper() {
  const posts = await getCachedTrending()
  return <TrendingSection posts={posts} />
}

async function CommunityWrapper() {
  const posts = await getCachedCommunity()
  return <CommunitySection posts={posts} />
}

async function Life2Wrapper() {
  const posts = await getCachedLife2()
  return <Life2Section posts={posts} />
}

async function MagazineWrapper() {
  const posts = await getCachedMagazine()
  return <MagazineSection posts={posts} />
}

async function JobWrapper() {
  const jobs = await getCachedJobs()
  return <JobSection jobs={jobs} />
}

async function ActivityWrapper() {
  // auth()는 NextAuth v5 request memoization → 이미 page level에서 호출한 것과 동일 결과 (DB 1번)
  const [session, activityPulse] = await Promise.all([auth(), getCachedActivityPulse()])
  const myCounts = session?.user?.id ? await getUserCounts(session.user.id) : null
  if (myCounts) {
    return (
      <>
        <MyActivity
          todayPosts={myCounts.todayPosts}
          newComments={myCounts.newComments}
          receivedLikes={myCounts.receivedLikes}
        />
        <ActivityPulse activeCount={activityPulse.activeCount} recentActivities={activityPulse.recentActivities} />
      </>
    )
  }
  return <ActivityPulse activeCount={activityPulse.activeCount} recentActivities={activityPulse.recentActivities} />
}

async function HomeSidebarWrapper() {
  // getCachedCommunity는 unstable_cache → CommunityWrapper와 캐시 공유 (DB 쿼리 1번)
  const posts = await getCachedCommunity()
  return <HomeSidebar posts={posts} />
}

/* ── 페이지 ── */

export default async function HomePage() {
  // auth()만 await — HeroSlider 이전에 회원 여부 판단 필요
  const session = await auth()
  const isMember = !!session?.user

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: '우리 나이가 어때서',
    alternateName: '우나어',
    url: 'https://www.age-doesnt-matter.com',
    logo: 'https://www.age-doesnt-matter.com/logo-512.png',
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
    url: 'https://www.age-doesnt-matter.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.age-doesnt-matter.com/search?q={search_term_string}',
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
          {/* HeroSlider — Promise.all 제거로 auth() 완료 즉시 스트리밍 */}
          <HeroSlider />

          <div className="block lg:grid lg:grid-cols-[1fr_300px] lg:gap-5 lg:px-8">
            <div>
              {/* 회원 전용 인사 카드 — auth() 결과 즉시 사용 */}
              {isMember && session.user?.nickname && (
                <PersonalGreeting nickname={session.user.nickname} />
              )}

              <Suspense fallback={<SectionSkeleton />}>
                <TrendingWrapper />
              </Suspense>

              {/* HOME_SECTION 광고 — TrendingSection 다음 (위치 유지) */}
              <AdSenseUnit
                slotId={ADSENSE.HOME_SECTION}
                format="horizontal"
                className="my-4 rounded-2xl overflow-hidden"
              />

              <Suspense fallback={<SectionSkeleton />}>
                <CommunityWrapper />
              </Suspense>

              <ResponsiveAd
                mobile={<CoupangBanner preset="mobile" className="my-4 rounded-2xl overflow-hidden" />}
                desktop={null}
              />

              <Suspense fallback={<SectionSkeleton />}>
                <Life2Wrapper />
              </Suspense>

              {/* IN_FEED 광고 — Life2Section 다음 */}
              <FeedAd />

              <Suspense fallback={<SectionSkeleton />}>
                <MagazineWrapper />
              </Suspense>

              {/* CoupangCarousel — MagazineSection 다음 (모바일만) */}
              <div className="block lg:hidden">
                <CoupangCarousel className="my-4 rounded-2xl overflow-hidden" />
              </div>

              <Suspense fallback={<SectionSkeleton h="h-[280px]" />}>
                <JobWrapper />
              </Suspense>

              <Suspense fallback={<SectionSkeleton h="h-[120px]" />}>
                <ActivityWrapper />
              </Suspense>

              {/* 비회원 가입 유도 카드 */}
              {!isMember && <SignupCard />}
            </div>

            <Suspense fallback={<div className="hidden lg:block" />}>
              <HomeSidebarWrapper />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}
