import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { getMagazineList } from '@/lib/queries/posts'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import CategorySearchBar from '@/components/features/community/CategorySearchBar'
import dynamic from 'next/dynamic'
const MagazineFilter = dynamic(() => import('@/components/features/magazine/MagazineFilter'))
import FeedAd from '@/components/ad/FeedAd'
import CoupangBanner from '@/components/ad/CoupangBanner'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'

export const revalidate = 60

export const metadata: Metadata = {
  title: '매거진',
  description: '건강, 재테크, 여행, 생활정보 등 50·60대를 위한 유익한 콘텐츠',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/magazine` },
  openGraph: {
    title: '매거진 | 우나어',
    description: '건강, 재테크, 여행, 생활정보 등 50·60대를 위한 유익한 콘텐츠',
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/magazine`,
    type: 'website',
    images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: '우나어' }],
  },
}

const getCachedMagazine = unstable_cache(
  () => getMagazineList({ limit: 20 }),
  ['magazine-list'],
  { revalidate: 60 }
)

const magazineCollectionPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: '우나어 매거진 — 50·60대를 위한 정보',
  description: '건강, 재테크, 여행, 생활정보 등 50대·60대를 위한 유익한 콘텐츠. 갱년기, 기초연금, 재취업, 인생 2막 정보.',
  url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/magazine`,
  publisher: {
    '@type': 'Organization',
    name: '우나어',
    logo: {
      '@type': 'ImageObject',
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/logo-512.png`,
    },
  },
  about: [
    { '@type': 'Thing', name: '갱년기' },
    { '@type': 'Thing', name: '기초연금' },
    { '@type': 'Thing', name: '50대 재취업' },
    { '@type': 'Thing', name: '인생 2막' },
    { '@type': 'Thing', name: '50대 건강관리' },
    { '@type': 'Thing', name: '중장년 재테크' },
  ],
  audience: {
    '@type': 'Audience',
    audienceType: '50대·60대 중장년',
  },
}

export default async function MagazinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sf?: string; category?: string }>
}) {
  const { q: rawQ, sf: rawSf, category: rawCategory } = await searchParams
  const q = rawQ?.trim() || undefined
  const sf = rawSf === 'title' || rawSf === 'content' ? rawSf : ('both' as const)
  const category = rawCategory && rawCategory !== '전체' ? rawCategory : undefined

  const { posts } = q || category
    ? await getMagazineList({ limit: 20, q, sf, category })
    : await getCachedMagazine()

  const featured = posts[0]
  const rest = posts.slice(1)

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(magazineCollectionPageJsonLd) }}
      />
      {/* GA4 게시판 조회 이벤트 */}
      <BoardViewTracker boardType="MAGAZINE" boardSlug="magazine" />
      <div className="px-4 py-6">
        <h1 className="text-title font-bold text-foreground mb-4 flex items-center gap-2">
          📖 매거진
        </h1>

        {/* 카테고리 탭 */}
        <Suspense fallback={null}>
          <MagazineFilter currentCategory={rawCategory} />
        </Suspense>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-body text-muted-foreground leading-relaxed">
              {q
                ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.`
                : category
                  ? `${category} 카테고리 매거진이 아직 없어요. 곧 올라올 거예요!`
                  : '아직 매거진이 없어요. 곧 유익한 글이 올라올 거예요!'}
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
                  {rest.slice(0, 8).map((post, index) => (
                    <MagazineCard key={post.id} post={post} priority={index < 2} />
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

        {/* 검색 */}
        <Suspense fallback={null}>
          <CategorySearchBar />
        </Suspense>
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-foreground text-caption font-bold mb-2">
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

function MagazineCard({ post, priority }: { post: PostSummary; priority?: boolean }) {
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
            priority={priority}
          />
        </div>
      ) : (
        <div className="w-full h-28 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl lg:h-36">
          📖
        </div>
      )}
      <div className="p-3">
        {post.category && (
          <span className="text-caption text-primary-text font-bold">{post.category}</span>
        )}
        <h3 className="text-body font-bold text-foreground m-0 line-clamp-2 leading-snug">
          {post.title}
        </h3>
        {post.preview && (
          <p className="text-sm text-muted-foreground mt-1 m-0 line-clamp-2">{post.preview}</p>
        )}
        <p className="text-caption text-muted-foreground mt-1 m-0">
          👁 {post.viewCount} · {formatTimeAgo(post.createdAt)}
        </p>
      </div>
    </Link>
  )
}
