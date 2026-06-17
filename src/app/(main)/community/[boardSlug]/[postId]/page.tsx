import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getBoardConfig } from '@/lib/queries/boards'
import { getPostDetail, getRelatedCommunityPosts } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import ActionBar from '@/components/features/community/ActionBar'
import PostCTA from '@/components/features/community/PostCTA'
import PostOwnerActions from '@/components/features/community/PostOwnerActions'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml, proxyR2Images } from '@/lib/sanitize'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangBanner from '@/components/ad/CoupangBanner'
import PostListBottom from '@/components/features/community/PostListBottom'
import NextPostsInline from '@/components/features/community/NextPostsInline'
import IdentityBanner from '@/components/features/community/IdentityBanner'
import { ADSENSE } from '@/components/ad/ad-slots'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import PostViewBeacon from '@/components/common/PostViewBeacon'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'
import { GREETING_CATEGORY } from '@/lib/greeting'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
export const dynamic = 'force-static'
export const revalidate = 30

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug, postId: rawPostId } = await params
  const postId = decodeURIComponent(rawPostId)
  // getPostDetail(postId) without user state is shared with the page render through Data Cache.
  // This avoids a separate getPostMeta DB round trip on the first ISR/MISS request.
  const post = await getPostDetail(postId)
  if (!post) return {}

  // CUID로 접근 시 streaming 시작 전에 308 redirect
  if (post.slug && postId !== post.slug) {
    permanentRedirect(`/community/${boardSlug}/${post.slug}`)
  }

  const canonicalId = post.slug ?? postId
  const url = `${BASE_URL}/community/${boardSlug}/${canonicalId}`
  const description = post.preview || '50·60대가 나이 걱정 없이 소통하는 따뜻한 커뮤니티'

  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? description,
    alternates: { canonical: url },
    openGraph: {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? description,
      url,
      type: 'article',
      siteName: '우리 나이가 어때서',
      locale: 'ko_KR',
      ...(post.thumbnailUrl ? { images: [{ url: post.thumbnailUrl, width: 1200, height: 630, alt: post.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? description,
    },
    // 가입인사 글은 검색엔진 색인 제외(환대 목적 내부 콘텐츠 — 목록/sitemap에서도 제외됨)
    ...(post.category === GREETING_CATEGORY
      ? { robots: { index: false, follow: false } }
      : {}),
  }
}

async function CommentsLoader({ postId, isGreeting }: {
  postId: string
  isGreeting?: boolean
}) {
  const comments = await getCommentsByPostId(postId)
  return <CommentSection postId={postId} comments={comments} isGreeting={isGreeting} />
}

export default async function PostDetailPage({ params }: PageProps) {
  const { boardSlug, postId: rawPostId } = await params
  const postId = decodeURIComponent(rawPostId)

  const [board, post] = await Promise.all([
    getBoardConfig(boardSlug),
    getPostDetail(postId),
  ])
  if (!board) notFound()
  if (!post) notFound()

  const backHref = `/community/${boardSlug}`
  const backLabel = board.displayName

  // CUID로 접근했는데 slug가 있으면 slug URL로 308 영구 redirect
  if (post.slug && postId !== post.slug) {
    permanentRedirect(`/community/${boardSlug}/${post.slug}`)
  }

  // slug로 접근한 경우에도 DB의 실제 CUID를 사용 (comments/likes FK 보장)
  const resolvedId = post.id

  // 관련글 1회 조회 → 본문끝 ②(0~2) + 하단(3~14)로 분배 (category 우선, 부족 시 최신순 fallback)
  const related = await getRelatedCommunityPosts(post.boardType, post.category || null, resolvedId, 15)

  const canonicalSlug = post.slug ?? postId
  const url = `${BASE_URL}/community/${boardSlug}/${canonicalSlug}`
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: '홈', path: '/' },
    { name: board.displayName, path: `/community/${boardSlug}` },
    { name: post.title, path: `/community/${boardSlug}/${canonicalSlug}` },
  ])
  const firstContentImage = post.content
    ? (post.content.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null)
    : null
  const ogImage = post.thumbnailUrl || firstContentImage || `${BASE_URL}/icon-1024.png`
  const contentText = post.content
    ? post.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 150)
    : ''
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: contentText || post.preview || '50·60대가 나이 걱정 없이 소통하는 따뜻한 커뮤니티',
    image: ogImage,
    url,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    publisher: {
      '@type': 'Organization',
      name: '우리 나이가 어때서',
      url: BASE_URL,
    },
    author: {
      '@type': 'Person',
      name: post.author.nickname,
    },
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8 bg-[var(--surface-warm)] min-h-screen">
      {/* GA4 게시글 조회 이벤트 + PostView DB 기록 */}
      <GTMEventOnMount event="post_view" data={{ post_id: resolvedId, board_type: board.boardType, category: post.category ?? '' }} />
      <PostViewBeacon postId={resolvedId} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: '홈', href: '/' },
        { label: board.displayName, href: `/community/${boardSlug}` },
        { label: post.title },
      ]} />

      {/* 뒤로가기 */}
      <div className="flex items-center justify-between">
        {/* lg:hidden: 데스크탑은 Breadcrumbs의 breadcrumb nav가 내비게이션 담당 */}
        <Link href={backHref} className="lg:hidden inline-flex items-center gap-1 text-[17px] font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-colors hover:text-primary-text hover:bg-primary/5">
          ← {backLabel}
        </Link>
        <PostOwnerActions authorId={post.author.id} boardSlug={boardSlug} postId={resolvedId} />
      </div>

      {/* 정체성 배너 (네이버 유입자 락인 ① — 비회원, 제목 위) */}
      <IdentityBanner boardSlug={boardSlug} />

      {/* 글 카드: 헤더 + 본문 + 공감/공유 한 덩어리 */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-4">
      {/* 헤더 */}
      <div className="pb-5 mb-5 border-b border-border">
        <h1 className="text-xl font-bold text-foreground m-0 mb-4 leading-[1.4]">{post.title}</h1>
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <span title={post.author.gradeEmoji}>{post.author.gradeEmoji}</span>
          <span className="font-bold text-foreground">{post.author.nickname}</span>
          <span>·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          <span>·</span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="post-content text-body text-foreground leading-[1.85] mb-5 break-keep [&_p]:mb-4 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:my-4 [&_hr]:border-border [&_hr]:my-6 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:my-4 [&_video]:w-full [&_video]:rounded-xl [&_video]:my-4 [&_.image-placeholder]:py-6 [&_.image-placeholder]:px-4 [&_.image-placeholder]:bg-muted [&_.image-placeholder]:rounded-xl [&_.image-placeholder]:text-center [&_.image-placeholder]:text-muted-foreground [&_.image-placeholder]:text-[17px] [&_.image-placeholder]:my-4"
        dangerouslySetInnerHTML={{ __html: proxyR2Images(sanitizeHtml(post.content)) }}
      />

      {/* 액션 바 — 글 카드 안, 본문 직후 바로 공감 (정독 동선) */}
      <ActionBar
        postId={resolvedId}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={false}
        isScrapped={false}
        className="border-y-0 border-t mb-0 pt-3"
      />
      </div>

      {/* 광고 — 인아티클 */}
      <div className="mb-8">
        <AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />
      </div>

      {/* 실험 exp1_related_flow — 본문 직후(광고① 다음, 댓글 전) "다음에 읽기 좋은 이야기".
          B variant 만 카드 렌더, A/B 모두 노출 기록(클라). 하단 PostListBottom 은 그대로 유지. */}
      <NextPostsInline postId={resolvedId} boardSlug={boardSlug} posts={related.slice(0, 3)} />

      {/* 댓글 — Suspense로 지연 로딩 */}
      <Suspense fallback={
        <div className="mb-12 space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse w-32" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
        </div>
      }>
        <CommentsLoader postId={resolvedId} isGreeting={post.category === GREETING_CATEGORY} />
      </Suspense>

      {/* 가입 유도 */}
      <PostCTA postId={resolvedId} postTitle={post.title} />

      {/* 하단 연속 읽기 */}
      <CoupangBanner preset="mobile" className="my-6 rounded-2xl overflow-hidden" />
      <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/50 rounded-2xl" />}>
        <PostListBottom
          boardType={board.boardType}
          boardSlug={boardSlug}
          excludePostId={resolvedId}
          displayName={board.displayName}
          mode="related"
          relatedPosts={related}
        />
      </Suspense>

      {/* 하단 애드센스 띠배너 (반응형 디스플레이) */}
      <AdSenseUnit slotId={ADSENSE.POST_BOTTOM_BANNER} format="auto" className="rounded-2xl overflow-hidden mt-6" />
    </div>
  )
}
