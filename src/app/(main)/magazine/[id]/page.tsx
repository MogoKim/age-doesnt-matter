import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { getPostDetail } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import { prisma } from '@/lib/prisma'
import ActionBar from '@/components/features/community/ActionBar'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml } from '@/lib/sanitize'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangBanner from '@/components/ad/CoupangBanner'
import CoupangSearchWidget from '@/components/ad/CoupangSearchWidget'
import { ADSENSE } from '@/components/ad/ad-slots'

const BASE_URL = 'https://age-doesnt-matter.com'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const post = await getPostDetail(id)
  if (!post) return {}

  const url = `${BASE_URL}/magazine/${id}`
  const description = post.preview || '50·60대를 위한 유익한 매거진 콘텐츠'

  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      type: 'article',
      siteName: '우리 나이가 어때서',
      locale: 'ko_KR',
      ...(post.thumbnailUrl ? { images: [{ url: post.thumbnailUrl, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
    },
  }
}

/** 매거진 글의 CPS 상품 링크 조회 */
async function getCpsLinks(postId: string) {
  return prisma.cpsLink.findMany({
    where: { postId },
    select: {
      id: true,
      productName: true,
      productUrl: true,
      productImageUrl: true,
      rating: true,
    },
  })
}

export default async function MagazineDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await auth()
  const userId = session?.user?.id

  const post = await getPostDetail(id, userId)
  if (!post || post.boardType !== 'MAGAZINE') notFound()

  const [comments, cpsLinks] = await Promise.all([
    getCommentsByPostId(id, userId),
    getCpsLinks(id),
  ])

  // JSON-LD 구조화 데이터
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.preview || '',
    url: `${BASE_URL}/magazine/${id}`,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    publisher: {
      '@type': 'Organization',
      name: '우리 나이가 어때서',
      url: BASE_URL,
    },
    author: {
      '@type': 'Organization',
      name: '우나어 매거진',
    },
    ...(post.thumbnailUrl ? { image: post.thumbnailUrl } : {}),
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* GA4 매거진 조회 이벤트 */}
      <GTMEventOnMount event="magazine_view" data={{ article_id: id, article_title: post.title, category: post.category ?? '' }} />
      {/* 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 뒤로가기 */}
      <Link
        href="/magazine"
        className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 매거진
      </Link>

      {/* 헤더 */}
      <div className="mb-8 pb-6 border-b border-border">
        {post.category && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-caption font-bold w-fit mb-2">
            {post.category}
          </span>
        )}
        <h1 className="text-2xl font-bold text-foreground m-0 mb-4 leading-[1.4]">
          {post.title}
        </h1>
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <span className="font-medium text-foreground">우나어 매거진</span>
          <span>·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          <span>·</span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>

      {/* 본문 */}
      <article
        className="text-sm text-foreground leading-[1.85] mb-8 break-keep [&_p]:mb-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_h3]:text-body [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_li]:mb-1 [&_strong]:font-bold"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
      />

      {/* CPS 추천 상품 */}
      {cpsLinks.length > 0 && (
        <div className="mb-8 p-4 bg-[var(--surface-warm)] rounded-2xl border border-border">
          <h3 className="text-body font-bold text-foreground mb-3 flex items-center gap-2">
            🛒 관련 추천 상품
          </h3>
          <div className="space-y-3">
            {cpsLinks.map((link) => (
              <a
                key={link.id}
                href={link.productUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border no-underline transition-all hover:border-primary/30 hover:shadow-sm min-h-[52px]"
              >
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center text-xl flex-shrink-0">
                  🛍️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground m-0 line-clamp-1">
                    {link.productName}
                  </p>
                  {link.rating && (
                    <p className="text-caption text-muted-foreground m-0">
                      ⭐ {link.rating}
                    </p>
                  )}
                </div>
                <span className="text-caption text-primary font-bold flex-shrink-0">
                  보러가기 →
                </span>
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 m-0">
            광고 · 이 링크를 통해 구매 시 소정의 수수료를 받을 수 있습니다
          </p>
        </div>
      )}

      {/* 액션 바 */}
      <ActionBar
        postId={id}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={post.isLiked}
        isScrapped={post.isScrapped}
      />

      {/* 광고 — 인아티클 + 쿠팡 상품 캐러셀 + 검색위젯 */}
      <div className="mb-8 space-y-4">
        <AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />
        <CoupangBanner preset="product" className="rounded-2xl overflow-hidden" />
        <CoupangSearchWidget />
      </div>

      {/* 댓글 */}
      <CommentSection postId={id} comments={comments} />
    </div>
  )
}
