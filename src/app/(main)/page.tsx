import type { Metadata } from 'next'
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
import StickyBottomAd from '@/components/ad/StickyBottomAd'
import {
  getLatestJobs,
  getTrendingPosts,
  getLatestMagazinePosts,
  getLatestCommunityPosts,
  getLatestLife2Posts,
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

export default async function HomePage() {
  // layout.tsx와 동일 요청 내 auth() 호출 — NextAuth v5 request memoization으로 중복 쿼리 없음
  const session = await auth()
  const isMember = !!session?.user

  const [jobs, trending, magazine, community, life2, myCounts] = await Promise.all([
    getCachedJobs(),
    getCachedTrending(),
    getCachedMagazine(),
    getCachedCommunity(),
    getCachedLife2(),
    // 회원 전용 활동 현황 — 에러 시 자동 null 폴백 (getUserCounts 내부 try-catch)
    isMember && session.user?.id ? getUserCounts(session.user.id) : Promise.resolve(null),
  ])

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
          {/* HeroSlider — 자체적으로 DB 배너 조회 (즉시 반영, 캐시 없음) */}
          <HeroSlider />

          <div className="block lg:grid lg:grid-cols-[1fr_300px] lg:gap-5 lg:px-8">
            <div>
              {/* 회원 전용 인사 카드 */}
              {isMember && session.user?.nickname && (
                <PersonalGreeting nickname={session.user.nickname} />
              )}

              <TrendingSection posts={trending} />

              {/* HOME_SECTION 광고 — TrendingSection 다음 (위치 유지) */}
              <AdSenseUnit
                slotId={ADSENSE.HOME_SECTION}
                format="horizontal"
                className="my-4 rounded-2xl overflow-hidden"
              />

              <CommunitySection posts={community} />

              <ResponsiveAd
                mobile={<CoupangBanner preset="mobile" className="my-4 rounded-2xl overflow-hidden" />}
                desktop={null}
              />

              <Life2Section posts={life2} />

              {/* IN_FEED 광고 — Life2Section 다음으로 이동 (기존: MagazineSection 다음) */}
              <FeedAd />

              <MagazineSection posts={magazine} />

              {/* CoupangCarousel — MagazineSection 다음으로 이동 (기존: Life2Section 다음) */}
              <div className="block lg:hidden">
                <CoupangCarousel className="my-4 rounded-2xl overflow-hidden" />
              </div>

              <JobSection jobs={jobs} />

              {/* 활동 현황 — 회원: MyActivity + ActivityPulse / 비회원: ActivityPulse */}
              {isMember && myCounts ? (
                <>
                  <MyActivity
                    todayPosts={myCounts.todayPosts}
                    newComments={myCounts.newComments}
                    receivedLikes={myCounts.receivedLikes}
                  />
                  <ActivityPulse />
                </>
              ) : (
                <ActivityPulse />
              )}

              {/* 비회원 가입 유도 카드 (홈 중반부 1회) */}
              {!isMember && <SignupCard />}
            </div>

            <HomeSidebar posts={community} />
          </div>
        </div>
      </div>

      {/* StickyBottomAd — 스크롤 50% 이상 시 하단 fixed 광고 (모바일 전용) */}
      <StickyBottomAd />
    </>
  )
}
