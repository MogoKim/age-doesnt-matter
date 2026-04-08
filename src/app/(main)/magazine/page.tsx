import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { unstable_cache } from 'next/cache'
import { getMagazineList } from '@/lib/queries/posts'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import FeedAd from '@/components/ad/FeedAd'
import CoupangBanner from '@/components/ad/CoupangBanner'

export const metadata: Metadata = {
  title: '매거진',
  description: '건강, 재테크, 여행, 생활정보 등 50·60대를 위한 유익한 콘텐츠',
  alternates: { canonical: 'https://age-doesnt-matter.com/magazine' },
  openGraph: {
    title: '매거진 | 우나어',
    description: '건강, 재테크, 여행, 생활정보 등 50·60대를 위한 유익한 콘텐츠',
    url: 'https://age-doesnt-matter.com/magazine',
    type: 'website',
  },
}

const getCachedMagazine = unstable_cache(
  () => getMagazineList({ limit: 20 }),
  ['magazine-list'],
  { revalidate: 60 }
)

export default async function MagazinePage() {
  const { posts } = await getCachedMagazine()

  const featured = posts[0]
  const rest = posts.slice(1)

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6">
        <h2 className="text-title font-bold text-foreground mb-6 flex items-center gap-2">
          📖 매거진
        </h2>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-body text-muted-foreground leading-relaxed">
              아직 매거진이 없어요. 곧 유익한 글이 올라올 거예요!
            </p>
          </div>
        ) : (
          <>
            {/* 최신 1건: 대형 카드 */}
            {featured && <FeaturedCard post={featured} />}

            {/* 피처 카드 아래 광고 */}
            <FeedAd />

            {/* 나머지: 2열 그리드 (8번째 카드 뒤 광고 삽입) */}
            {rest.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3 mt-4 lg:grid-cols-4">
                  {rest.slice(0, 8).map((post) => (
                    <MagazineCard key={post.id} post={post} />
                  ))}
                </div>
                <div className="my-4">
                  <CoupangBanner preset="mobile" className="rounded-2xl overflow-hidden" />
                </div>
                {rest.length > 8 && (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {rest.slice(8).map((post) => (
                      <MagazineCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FeaturedCard({ post }: { post: PostSummary }) {
  return (
    <Link
      href={`/magazine/${post.slug ?? post.id}`}
      className="block bg-card rounded-2xl border border-border overflow-hidden no-underline transition-all hover:border-primary/30 hover:shadow-md"
    >
      {post.thumbnailUrl ? (
        <div className="relative w-full h-48 lg:h-64">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 800px"
            priority
          />
        </div>
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-4xl lg:h-64">
          📖
        </div>
      )}
      <div className="p-4">
        {post.category && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-caption font-bold mb-2">
            {post.category}
          </span>
        )}
        <h3 className="text-title font-bold text-foreground m-0 mb-2 line-clamp-2">{post.title}</h3>
        <div className="flex items-center gap-3 text-caption text-muted-foreground">
          <span>👁 {post.viewCount}</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
        </div>
      </div>
    </Link>
  )
}

function MagazineCard({ post }: { post: PostSummary }) {
  return (
    <Link
      href={`/magazine/${post.slug ?? post.id}`}
      className="block bg-card rounded-xl border border-border overflow-hidden no-underline transition-all hover:border-primary/30"
    >
      {post.thumbnailUrl ? (
        <div className="relative w-full h-28 lg:h-36">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 50vw, 25vw"
          />
        </div>
      ) : (
        <div className="w-full h-28 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl lg:h-36">
          📖
        </div>
      )}
      <div className="p-3">
        {post.category && (
          <span className="text-caption text-primary font-bold">{post.category}</span>
        )}
        <h3 className="text-body font-bold text-foreground m-0 line-clamp-2 leading-snug">
          {post.title}
        </h3>
        <p className="text-caption text-muted-foreground mt-1 m-0">
          👁 {post.viewCount} · {formatTimeAgo(post.createdAt)}
        </p>
      </div>
    </Link>
  )
}
