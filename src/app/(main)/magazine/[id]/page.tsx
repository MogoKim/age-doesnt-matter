import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { getPostDetail } from '@/lib/queries/posts'
import { getRelatedMagazinePosts } from '@/lib/queries/posts/posts.magazine'
import { getCommentsByPostId } from '@/lib/queries/comments'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'
import ActionBar from '@/components/features/community/ActionBar'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeMagazineHtml, proxyMagazineImages } from '@/lib/sanitize'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangSearchWidget from '@/components/ad/CoupangSearchWidget'
import CpsClickTracker from '@/components/ad/CpsClickTracker'
import { ADSENSE } from '@/components/ad/ad-slots'

const BASE_URL = 'https://www.age-doesnt-matter.com'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
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
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      type: 'article',
      siteName: '우리 나이가 어때서',
      locale: 'ko_KR',
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.seoTitle ?? post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
    },
  }
}

/** 본문 HTML에서 FAQ 블록 파싱 → FAQPage JSON-LD 생성 */
function extractFaqJsonLd(html: string): object | null {
  const match = html.match(/<!-- FAQ_START -->([\s\S]*?)<!-- FAQ_END -->/)
  if (!match) return null

  const faqHtml = match[1]
  const items: { q: string; a: string }[] = []
  const qaRegex = /<summary>Q\.\s*([^<]+)<\/summary>\s*<p>A\.\s*([^<]+)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = qaRegex.exec(faqHtml)) !== null) {
    items.push({ q: m[1].trim(), a: m[2].trim() })
  }
  if (items.length === 0) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

/** 매거진 글의 CPS 상품 링크 조회 (5분 캐시) */
async function getCpsLinks(postId: string) {
  return unstable_cache(
    () =>
      prisma.cpsLink.findMany({
        where: { postId },
        select: {
          id: true,
          productName: true,
          productUrl: true,
          productImageUrl: true,
          rating: true,
        },
      }),
    [`cps-links-${postId}`],
    { revalidate: 300 },
  )()
}

export default async function MagazineDetailPage({ params }: PageProps) {
  const { id: rawId } = await params
  // Next.js 미들웨어 통과 시 한글 slug params가 자동 디코딩 안 됨 → 수동 디코딩
  const id = decodeURIComponent(rawId)
  const session = await auth()
  const userId = session?.user?.id

  const post = await getPostDetail(id, userId)
  if (!post || post.boardType !== 'MAGAZINE') notFound()

  // CUID로 접근했는데 slug가 있으면 slug URL로 308 영구 redirect
  if (post.slug && id !== post.slug) {
    permanentRedirect(`/magazine/${post.slug}`)
  }

  // slug로 접근한 경우에도 DB의 실제 CUID를 사용 (comments/CPS/ActionBar FK 보장)
  const resolvedId = post.id

  const [comments, cpsLinks, relatedPosts] = await Promise.all([
    getCommentsByPostId(resolvedId, userId),
    getCpsLinks(resolvedId),
    getRelatedMagazinePosts(post.category ?? null, resolvedId, 3),
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

  const faqJsonLd = post.content ? extractFaqJsonLd(post.content) : null

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* GA4 매거진 조회 이벤트 */}
      <GTMEventOnMount event="magazine_view" data={{ article_id: id, article_title: post.title, category: post.category ?? '' }} />
      {/* 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd([
          { name: '홈', path: '/' },
          { name: '매거진', path: '/magazine' },
          { name: post.title, path: `/magazine/${canonicalSlug}` },
        ])) }}
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
              <CpsClickTracker key={link.id} productName={link.productName} category="magazine">
                <a
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
              </CpsClickTracker>
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

      {/* 함께 읽어보세요 */}
      {relatedPosts.length > 0 && (
        <div className="mb-8">
          <h3 className="text-body font-bold text-foreground mb-4">함께 읽어보세요</h3>
          <div className="space-y-3">
            {relatedPosts.map((related) => (
              <a
                key={related.id}
                href={`/magazine/${related.slug ?? related.id}`}
                className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border no-underline transition-all hover:border-primary/30 hover:shadow-sm min-h-[52px]"
              >
                <div className="flex-1 min-w-0">
                  {related.category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[13px] font-bold mb-1">
                      {related.category}
                    </span>
                  )}
                  <p className="text-body font-medium text-foreground m-0 line-clamp-2 leading-[1.4]">
                    {related.title}
                  </p>
                </div>
                <span className="text-caption text-muted-foreground flex-shrink-0 mt-1">→</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 댓글 */}
      <CommentSection postId={resolvedId} comments={comments} />
    </div>
  )
}
