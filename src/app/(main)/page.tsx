import HeroSlider from '@/components/features/home/HeroSlider'
import IdentitySection from '@/components/features/home/IdentitySection'
import JobSection from '@/components/features/home/JobSection'
import TrendingSection from '@/components/features/home/TrendingSection'
import EditorsPickSection from '@/components/features/home/EditorsPickSection'
import AdInline from '@/components/features/home/AdInline'
import MagazineSection from '@/components/features/home/MagazineSection'
import CommunitySection from '@/components/features/home/CommunitySection'
import HomeSidebar from '@/components/features/home/HomeSidebar'
import {
  getLatestJobs,
  getTrendingPosts,
  getEditorsPicks,
  getLatestMagazinePosts,
  getLatestCommunityPosts,
} from '@/lib/queries/posts'

// 동적 렌더링 + 60초 ISR 캐싱
export const revalidate = 60
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [jobs, trending, editorsPicks, magazine, community] = await Promise.all([
    getLatestJobs(5),
    getTrendingPosts(5),
    getEditorsPicks(2),
    getLatestMagazinePosts(4),
    getLatestCommunityPosts(5),
  ])

  return (
    <div className="pt-[calc(56px+64px)] lg:pt-0">
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
            <CommunitySection posts={community} />
          </div>
          <HomeSidebar posts={community} />
        </div>
      </div>
    </div>
  )
}
