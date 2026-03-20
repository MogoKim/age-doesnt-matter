import type { Metadata } from 'next'
import type { AdSlot } from '@/generated/prisma/client'
import { getBannerList, getAdBannerList } from '@/lib/queries/admin'
import BannerManager from '@/components/admin/BannerManager'
import AdBannerTable from '@/components/admin/AdBannerTable'

export const metadata: Metadata = { title: '배너·광고 관리' }

interface Props {
  searchParams: Promise<{
    tab?: string
    slot?: string
    cursor?: string
  }>
}

export default async function AdminBannersPage({ searchParams }: Props) {
  const params = await searchParams
  const tab = params.tab || 'hero'

  if (tab === 'hero') {
    const banners = await getBannerList()
    return (
      <div className="space-y-4">
        <BannerManager banners={banners} activeTab={tab} />
      </div>
    )
  }

  const { ads, hasMore } = await getAdBannerList({
    slot: params.slot as AdSlot | undefined,
    cursor: params.cursor,
  })

  return (
    <div className="space-y-4">
      <AdBannerTable
        ads={ads}
        hasMore={hasMore}
        activeTab={tab}
        currentSlot={params.slot}
      />
    </div>
  )
}
