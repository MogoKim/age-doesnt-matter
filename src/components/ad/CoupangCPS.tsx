import Image from 'next/image'
import { prisma } from '@/lib/prisma'

interface CoupangCPSProps {
  postId: string
}

export default async function CoupangCPS({ postId }: CoupangCPSProps) {
  const links = await prisma.cpsLink.findMany({
    where: { postId },
    take: 3,
    orderBy: { createdAt: 'desc' },
  })

  if (links.length === 0) return null

  return (
    <aside
      className="mt-6 rounded-xl border border-border bg-[var(--surface-warm)] p-4"
      role="complementary"
      aria-label="추천 상품"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">이 글과 관련된 상품</h3>
        <span className="text-[13px] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border">
          광고
        </span>
      </div>
      <div className="grid gap-3">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.productUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex items-center gap-3 rounded-lg bg-white p-3 border border-border hover:border-[var(--primary)] transition-colors"
          >
            {link.productImageUrl && (
              <Image
                src={link.productImageUrl}
                alt={link.productName}
                width={64}
                height={64}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-foreground truncate">{link.productName}</p>
              {link.rating && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {'★'.repeat(Math.round(link.rating))}
                  {'☆'.repeat(5 - Math.round(link.rating))}
                  {' '}
                  {link.rating.toFixed(1)}
                </p>
              )}
            </div>
            <span className="text-sm text-[var(--primary-text)] font-medium flex-shrink-0">보러가기</span>
          </a>
        ))}
      </div>
    </aside>
  )
}
