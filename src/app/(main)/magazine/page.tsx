import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import nextDynamic from 'next/dynamic'
import { getMagazineListPage } from '@/lib/queries/posts'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'

const MagazineFilter = nextDynamic(() => import('@/components/features/magazine/MagazineFilter'))

export const dynamic = 'force-dynamic'

const LIMIT = 12

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
  searchParams: Promise<{ q?: string; sf?: string; category?: string; page?: string }>
}) {
  const { q: rawQ, sf: rawSf, category: rawCategory, page: rawPage } = await searchParams
  const q = rawQ?.trim() || undefined
  const sf = rawSf === 'title' || rawSf === 'content' ? rawSf : ('both' as const)
  const category = rawCategory && rawCategory !== '전체' ? rawCategory : undefined
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const skip = (page - 1) * LIMIT

  let posts: PostSummary[]
  let total: number

  if (q || category || page > 1) {
    ;({ posts, total } = await getMagazineListPage({ category, skip, limit: LIMIT, q, sf }))
  } else {
    const getCached = unstable_cache(
      () => getMagazineListPage({ skip: 0, limit: LIMIT }),
      ['magazine-list-page1'],
      { revalidate: 60 },
    )
    ;({ posts, total } = await getCached())
  }

  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''
  const categorySuffix = category ? `&category=${encodeURIComponent(category)}` : ''

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(magazineCollectionPageJsonLd) }}
      />
      <BoardViewTracker boardType="MAGAZINE" boardSlug="magazine" />
      <div className="px-4 py-6">
        <h1 className="text-title font-bold text-foreground mb-4 flex items-center gap-2">
          📖 매거진
        </h1>

        <Suspense fallback={null}>
          <MagazineFilter currentCategory={rawCategory} />
        </Suspense>

        {posts.length === 0 ? (
          <>
            <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-4">
              <p className="text-body text-muted-foreground leading-relaxed">
                {q
                  ? `"${q}" 검색 결과가 없어요. 다른 검색어를 입력해 보세요.`
                  : category
                    ? `${category} 카테고리 매거진이 아직 없어요. 곧 올라올 거예요!`
                    : '아직 매거진이 없어요. 곧 유익한 글이 올라올 거예요!'}
              </p>
            </div>
            <BoardPaginationFooter
              total={total}
              page={page}
              pageSize={LIMIT}
              buildHref={(p) => `/magazine?page=${p}${categorySuffix}${qSuffix}`}
            />
          </>
        ) : (
          <>
            <PostListWithAds
              items={posts}
              renderCard={(post, index) => <MagazineCard post={post} priority={index === 0} />}
              className="flex flex-col gap-4 mt-4"
            />
            <BoardPaginationFooter
              total={total}
              page={page}
              pageSize={LIMIT}
              buildHref={(p) => `/magazine?page=${p}${categorySuffix}${qSuffix}`}
            />
          </>
        )}
      </div>
    </div>
  )
}

function MagazineCard({ post, priority }: { post: PostSummary; priority?: boolean }) {
  return (
    <Link
      href={`/magazine/${post.slug ?? post.id}`}
      className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border overflow-hidden no-underline transition-all hover:border-primary/30 min-h-[52px]"
    >
      {post.thumbnailUrl ? (
        <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            className="object-cover"
            sizes="96px"
            priority={priority}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl">
          📖
        </div>
      )}
      <div className="flex-1 min-w-0">
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
