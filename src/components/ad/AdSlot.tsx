import Image from 'next/image'
import { prisma } from '@/lib/prisma'
import type { AdSlot as AdSlotType } from '@/generated/prisma/client'

interface AdSlotProps {
  slot: AdSlotType
  className?: string
}

export default async function AdSlot({ slot, className }: AdSlotProps) {
  const now = new Date()
  const ad = await prisma.adBanner.findFirst({
    where: {
      slot,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { priority: 'desc' },
  })

  if (!ad) return null

  // 노출 카운트 증가 (fire-and-forget)
  prisma.adBanner.update({
    where: { id: ad.id },
    data: { impressions: { increment: 1 } },
  }).catch(() => {})

  return (
    <aside className={`relative ${className ?? ''}`} role="complementary" aria-label="광고">
      <span className="absolute top-2 right-3 text-caption text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border z-10">
        광고
      </span>

      {ad.adType === 'GOOGLE' && ad.htmlCode && (
        <div dangerouslySetInnerHTML={{ __html: ad.htmlCode }} />
      )}

      {ad.adType === 'COUPANG' && ad.htmlCode && (
        <div dangerouslySetInnerHTML={{ __html: ad.htmlCode }} />
      )}

      {(ad.adType === 'SELF' || ad.adType === 'EXTERNAL') && ad.imageUrl && (
        <a href={ad.clickUrl ?? '#'} target="_blank" rel="noopener noreferrer nofollow" className="block">
          <Image src={ad.imageUrl} alt={ad.title ?? '광고'} width={728} height={90} className="w-full rounded-lg" />
        </a>
      )}

      {!ad.imageUrl && !ad.htmlCode && ad.title && (
        <a
          href={ad.clickUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block bg-[var(--surface-warm)] border border-border rounded-lg p-4 text-center hover:bg-zinc-50 transition-colors"
        >
          <p className="text-body font-medium text-foreground">{ad.title}</p>
        </a>
      )}
    </aside>
  )
}
