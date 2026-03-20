import HeroSlider from '@/components/features/home/HeroSlider'
import IdentitySection from '@/components/features/home/IdentitySection'
import JobSection from '@/components/features/home/JobSection'
import TrendingSection from '@/components/features/home/TrendingSection'
import EditorsPickSection from '@/components/features/home/EditorsPickSection'
import AdInline from '@/components/features/home/AdInline'
import MagazineSection from '@/components/features/home/MagazineSection'
import CommunitySection from '@/components/features/home/CommunitySection'
import HomeSidebar from '@/components/features/home/HomeSidebar'

export default function HomePage() {
  return (
    <div className="pt-[calc(56px+64px)] lg:pt-0">
      <HeroSlider />
      <IdentitySection />
      <div className="max-w-[1200px] mx-auto">
        <div className="block lg:grid lg:grid-cols-[1fr_300px] lg:gap-5 lg:px-8">
          <div>
            <JobSection />
            <TrendingSection />
            <EditorsPickSection />
            <AdInline />
            <MagazineSection />
            <CommunitySection />
          </div>
          <HomeSidebar />
        </div>
      </div>
    </div>
  )
}
