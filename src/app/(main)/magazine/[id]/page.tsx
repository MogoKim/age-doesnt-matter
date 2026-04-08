import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { getPostDetail } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import { prisma } from '@/lib/prisma'
import ActionBar from '@/components/features/community/ActionBar'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeMagazineHtml, proxyMagazineImages } from '@/lib/sanitize'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
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

  // slug가 있으면 slug URL을 canonical로, 없으면 id 기반 URL 사용
  const canonicalId = post.slug ?? id
  const url = `${BASE_URL}/magazine/${canonicalId}`
  // SEO description: 본문 텍스트 첫 150자 (Google 권장 155-160자) → preview(40자) 대비 CTR 개선
  const rawText = post.content
    ? post.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : ''
  const description = rawText.slice(0, 150) || post.preview || '50·60대를 위한 유익한 매거진 콘텐츠'

  // og:image: 썸네일 → 본문 첫 이미지 → 로고 순으로 fallback
  const firstContentImage = post.content
    ? (post.content.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null)
    : null
  const ogImage = post.thumbnailUrl || firstContentImage || `${BASE_URL}/logo.png`

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
      images: [{ url: ogImage, width: 1200, height: 630 }],
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
  // DEBUG: 임시 로그 — 이슈 해결 후 삭제
  console.error('[DEBUG-MAGAZINE]', JSON.stringify({ id, userId: userId ?? null, postFound: !!post, boardType: post?.boardType ?? null }))
  if (!post || post.boardType !== 'MAGAZINE') notFound()

  // CUID로 접근했는데 slug가 있으면 slug URL로 301 redirect
  if (post.slug && id !== post.slug) {
    redirect(`/magazine/${post.slug}`)
  }

  // slug로 접근한 경우에도 DB의 실제 CUID를 사용 (comments/CPS/ActionBar FK 보장)
  const resolvedId = post.id

  const [comments, cpsLinks] = await Promise.all([
    getCommentsByPostId(resolvedId, userId),
    getCpsLinks(resolvedId),
  ])

  // JSON-LD 구조화 데이터
  const canonicalSlug = post.slug ?? id
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.preview || '',
    url: `${BASE_URL}/magazine/${canonicalSlug}`,
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
      {!post.content || post.content.replace(/<[^>]*>/g, '').trim().length < 50 ? (
        <p className="text-muted-foreground text-body py-12 text-center">
          콘텐츠를 불러오는 중에 오류가 발생했어요. 잠시 후 다시 시도해주세요.
        </p>
      ) : (
        <article
          className="post-content text-body text-foreground leading-[1.85] mb-8 break-keep [&_p]:mb-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-foreground [&_h2]:border-l-4 [&_h2]:border-primary [&_h2]:pl-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1 [&_strong]:font-bold [&_aside.tip-box]:bg-amber-50 [&_aside.tip-box]:dark:bg-amber-950/30 [&_aside.tip-box]:border-l-4 [&_aside.tip-box]:border-amber-400 [&_aside.tip-box]:p-4 [&_aside.tip-box]:rounded-r-xl [&_aside.tip-box]:my-6 [&_aside.tip-box]:text-base [&_aside.tip-box]:leading-relaxed [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:my-6 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r-lg [&_figure]:my-6 [&_figure]:rounded-xl [&_figure]:overflow-hidden [&_figcaption]:text-caption [&_figcaption]:text-muted-foreground [&_figcaption]:text-center [&_figcaption]:mt-2 [&_figcaption]:px-2"
          dangerouslySetInnerHTML={{ __html: proxyMagazineImages(sanitizeMagazineHtml(post.content)) }}
        />
      )}

      {/* 광고 — 인아티클 */}
      <div className="mb-8">
        <AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />
      </div>

      {/* CPS 추천 상품 (쿠팡 상품링크) */}
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
                  <p className="text-body font-medium text-foreground m-0 line-clamp-1">
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

      {/* 쿠팡 관련 상품 */}
      <div className="mb-8">
        <CoupangSearchWidget />
      </div>

      {/* 액션 바 */}
      <ActionBar
        postId={resolvedId}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={post.isLiked}
        isScrapped={post.isScrapped}
        isLoggedIn={!!userId}
      />

      {/* 댓글 */}
      <CommentSection postId={resolvedId} comments={comments} />
    </div>
  )
}
