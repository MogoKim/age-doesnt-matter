import styles from '@/components/features/home/HomePage.module.css'
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
    <div className={styles.pageMain}>
      <HeroSlider />
      <IdentitySection />
      <div className={styles.homeLayout}>
        <div className={styles.homeLayoutInner}>
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
