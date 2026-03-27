import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import HeroSlider from '@/components/features/home/HeroSlider'
import IdentitySection from '@/components/features/home/IdentitySection'
import JobSection from '@/components/features/home/JobSection'
import TrendingSection from '@/components/features/home/TrendingSection'
import EditorsPickSection from '@/components/features/home/EditorsPickSection'
import AdInline from '@/components/features/home/AdInline'
import FeedAd from '@/components/ad/FeedAd'
import MagazineSection from '@/components/features/home/MagazineSection'
import CommunitySection from '@/components/features/home/CommunitySection'
import RecentActivityFeed from '@/components/features/home/RecentActivityFeed'
import HomeSidebar from '@/components/features/home/HomeSidebar'
import {
  getLatestJobs,
  getTrendingPosts,
  getEditorsPicks,
  getLatestMagazinePosts,
  getLatestCommunityPosts,
  getRecentActivities,
} from '@/lib/queries/posts'

export const metadata: Metadata = {
  title: '우리 나이가 어때서 — 5060 세대 커뮤니티',
  description: '나이 걱정 없이 소통하는 따뜻한 커뮤니티. 일자리 정보, 건강·생활 매거진, 자유로운 소통까지.',
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
const getCachedEditorsPicks = unstable_cache(
  () => getEditorsPicks(2),
  ['home-editors'],
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
const getCachedActivity = unstable_cache(
  () => getRecentActivities(8),
  ['home-activity'],
  { revalidate: 30 }
)

export default async function HomePage() {
  const [jobs, trending, editorsPicks, magazine, community, activities] = await Promise.all([
    getCachedJobs(),
    getCachedTrending(),
    getCachedEditorsPicks(),
    getCachedMagazine(),
    getCachedCommunity(),
    getCachedActivity(),
  ])

  return (
    <div>
      <h1 className="sr-only">우리 나이가 어때서 — 5060 세대 커뮤니티</h1>
      <HeroSlider />
      <IdentitySection />
      <div className="max-w-[1200px] mx-auto">
        <div className="block lg:grid lg:grid-cols-[1fr_300px] lg:gap-5 lg:px-8">
          <div>
            <JobSection jobs={jobs} />
            <TrendingSection posts={trending} />
            <EditorsPickSection posts={editorsPicks} />
            <AdInline />
            <MagazineSection posts={magazine} />
            <RecentActivityFeed activities={activities} />
            <CommunitySection posts={community} />
            <FeedAd format="horizontal" />
          </div>
          <HomeSidebar posts={community} />
        </div>
      </div>
    </div>
  )
}
