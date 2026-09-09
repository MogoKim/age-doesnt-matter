import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import TopPromoBannerClient from './TopPromoBannerClient'

const getGuestPromoSettings = unstable_cache(
  async () => {
    try {
      const rows = await prisma.setting.findMany({
        where: {
          key: {
            in: [
              'TOP_PROMO_GUEST_ENABLED',
              'TOP_PROMO_GUEST_TAG',
              'TOP_PROMO_GUEST_TEXT',
              'TOP_PROMO_GUEST_HREF',
            ],
          },
        },
      })
      const map: Record<string, string> = {}
      for (const row of rows) map[row.key] = row.value
      return {
        enabled: map['TOP_PROMO_GUEST_ENABLED'] !== 'false',
        tag:     map['TOP_PROMO_GUEST_TAG']  ?? '',
        text:    map['TOP_PROMO_GUEST_TEXT'] ?? '',
        href:    map['TOP_PROMO_GUEST_HREF'] ?? '/about',
      }
    } catch {
      return null
    }
  },
  ['top-promo-guest'],
  { revalidate: 60, tags: ['top-promo-guest'] },
)

const getMemberPromoSettings = unstable_cache(
  async () => {
    try {
      const rows = await prisma.setting.findMany({
        where: {
          key: {
            in: [
              'TOP_PROMO_MEMBER_ENABLED',
              'TOP_PROMO_MEMBER_TAG',
              'TOP_PROMO_MEMBER_TEXT',
              'TOP_PROMO_MEMBER_HREF',
            ],
          },
        },
      })
      const map: Record<string, string> = {}
      for (const row of rows) map[row.key] = row.value
      return {
        enabled: map['TOP_PROMO_MEMBER_ENABLED'] !== 'false',
        tag:     map['TOP_PROMO_MEMBER_TAG']  ?? '',
        text:    map['TOP_PROMO_MEMBER_TEXT'] ?? '',
        href:    map['TOP_PROMO_MEMBER_HREF'] ?? '/',
      }
    } catch {
      return null
    }
  },
  ['top-promo-member'],
  { revalidate: 60, tags: ['top-promo-member'] },
)

export default async function TopPromoBanner() {
  const [guestSettings, memberSettings] = await Promise.all([
    getGuestPromoSettings(),
    getMemberPromoSettings(),
  ])

  if (!guestSettings && !memberSettings) return null

  return (
    <TopPromoBannerClient
      guestSettings={guestSettings}
      memberSettings={memberSettings}
    />
  )
}
