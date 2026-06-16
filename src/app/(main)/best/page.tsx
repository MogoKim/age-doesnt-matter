import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { composeBestHot } from '@/lib/queries/posts/posts.best-compose'
import type { PostSummary } from '@/types/api'
import BestContent from '@/components/features/best/BestContent'

export const metadata: Metadata = {
  title: '이번 주 인기글 베스트',
  description: '40대 50대 60대 여성들이 가장 많이 공감하고 나눈 이번 주 인기 글 모음.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/best` },
}

const LIMIT = 12

const getCachedHot = unstable_cache(
  () => composeBestHot({ limit: LIMIT }),
  ['best-hot-p1-curated'],
  { revalidate: 60, tags: ['best-hot', 'home-curation'] },
)

export default async function BestPage() {
  const result = await getCachedHot().catch(() => ({ posts: [] as PostSummary[], total: 0 }))

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">인기글 — 우나어 베스트</h1>
      <BestContent initialPosts={result.posts} initialTotal={result.total} />
    </div>
  )
}
