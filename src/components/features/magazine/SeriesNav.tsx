import Link from 'next/link'
import { prisma } from '@/lib/prisma'

interface SeriesNavProps {
  seriesId: string
  seriesTitle: string
  seriesOrder: number
  seriesCount: number
}

interface SeriesPost {
  slug: string | null
  id: string
  title: string
  seriesOrder: number | null
}

async function getSeriesAdjacentPosts(seriesId: string, currentOrder: number): Promise<{
  prev: SeriesPost | null
  next: SeriesPost | null
}> {
  const [prev, next] = await Promise.all([
    prisma.post.findFirst({
      where: { seriesId, seriesOrder: currentOrder - 1, status: 'PUBLISHED' },
      select: { id: true, title: true, slug: true, seriesOrder: true },
    }),
    prisma.post.findFirst({
      where: { seriesId, seriesOrder: currentOrder + 1, status: 'PUBLISHED' },
      select: { id: true, title: true, slug: true, seriesOrder: true },
    }),
  ])
  return { prev, next }
}

export default async function SeriesNav({ seriesId, seriesTitle, seriesOrder, seriesCount }: SeriesNavProps) {
  const { prev, next } = await getSeriesAdjacentPosts(seriesId, seriesOrder)

  return (
    <div className="my-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📚</span>
        <span className="text-caption font-bold text-primary">{seriesTitle}</span>
        <span className="text-caption text-muted-foreground ml-auto">{seriesOrder}/{seriesCount}편</span>
      </div>

      <div className="flex gap-3">
        {prev ? (
          <Link
            href={`/magazine/${prev.slug ?? prev.id}`}
            className="flex-1 flex flex-col gap-1 rounded-lg bg-background border border-border p-3 no-underline min-h-[52px] transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="text-caption text-muted-foreground">← 이전 편</span>
            <span className="text-caption font-medium text-foreground line-clamp-1">{prev.title}</span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {next ? (
          <Link
            href={`/magazine/${next.slug ?? next.id}`}
            className="flex-1 flex flex-col gap-1 rounded-lg bg-background border border-border p-3 no-underline min-h-[52px] text-right transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="text-caption text-muted-foreground">다음 편 →</span>
            <span className="text-caption font-medium text-foreground line-clamp-1">{next.title}</span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  )
}
