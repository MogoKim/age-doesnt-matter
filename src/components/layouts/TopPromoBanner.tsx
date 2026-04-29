/**
 * TopPromoBanner — 전 페이지 최상단 홍보 띠 배너 (Server Component)
 * - 비로그인(GUEST): 회원가입 유도 배너
 * - 로그인(MEMBER): 공지·이벤트 배너
 * - auth()는 캐시 밖에서 호출 — unstable_cache 안에서 세션 읽기 금지
 */
import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
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
  const session = await auth()
  const settings = session?.user
    ? await getMemberPromoSettings()
    : await getGuestPromoSettings()

  if (!settings || !settings.enabled || !settings.text) return null

  const bannerType = session?.user ? 'member' : 'guest'

  return (
    <TopPromoBannerClient
      type={bannerType}
      tag={settings.tag}
      text={settings.text}
      href={settings.href}
    />
  )
}
