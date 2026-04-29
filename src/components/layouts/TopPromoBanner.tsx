/**
 * TopPromoBanner — 전 페이지 최상단 홍보 띠 배너 (Server Component)
 * - DB(Setting 테이블)에서 실시간 설정값 읽어 렌더
 * - TOP_PROMO_ENABLED = 'false' 이면 null 반환
 * - × 닫기: sessionStorage 저장 (새 탭에서는 다시 노출)
 */
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import TopPromoBannerClient from './TopPromoBannerClient'

const getPromoSettings = unstable_cache(
  async () => {
    try {
      const rows = await prisma.setting.findMany({
        where: {
          key: {
            in: ['TOP_PROMO_ENABLED', 'TOP_PROMO_TAG', 'TOP_PROMO_TEXT', 'TOP_PROMO_HREF'],
          },
        },
      })
      const map: Record<string, string> = {}
      for (const row of rows) map[row.key] = row.value
      return {
        enabled: map['TOP_PROMO_ENABLED'] !== 'false',
        tag:     map['TOP_PROMO_TAG']     ?? '',
        text:    map['TOP_PROMO_TEXT']    ?? '',
        href:    map['TOP_PROMO_HREF']    ?? '/about',
      }
    } catch {
      return null
    }
  },
  ['top-promo-settings'],
  { revalidate: 60, tags: ['top-promo-settings'] },
)

export default async function TopPromoBanner() {
  const settings = await getPromoSettings()
  if (!settings || !settings.enabled || !settings.text) return null

  return (
    <TopPromoBannerClient
      tag={settings.tag}
      text={settings.text}
      href={settings.href}
    />
  )
}
