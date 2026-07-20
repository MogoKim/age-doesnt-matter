import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getBoardConfig } from '@/lib/queries/boards'
import { getPostDetail, getRelatedCommunityPosts, getCrossBoardCandidates } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import ActionBar from '@/components/features/community/ActionBar'
import PostCTA from '@/components/features/community/PostCTA'
import PostOwnerActions from '@/components/features/community/PostOwnerActions'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml, proxyR2Images } from '@/lib/sanitize'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import NativeAdSlot from '@/components/ad/NativeAdSlot'
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
import { EVENT_CATEGORY } from '@/lib/event-category'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
export const dynamic = 'force-static'
// ISR Writes 절감: 봇 순회 재생성 완화(30→300s). 회원 댓글은 CommentSection의 no-store
// 재조회 + 댓글 작성 revalidatePath/Tag가 즉시성 담당 → TTL은 비로그인 노출 주기만 결정.
export const revalidate = 300

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug, postId: rawPostId } = await params
  const postId = decodeURIComponent(rawPostId)
  // getPostDetail(postId) without user state is shared with the page render through Data Cache.
  // This avoids a separate getPostMeta DB round trip on the first ISR/MISS request.
  const post = await getPostDetail(postId)
  // 미존재·HIDDEN·DELETED(getPostDetail은 PUBLISHED/SEO_ONLY만 조회) — noindex 단일 신호.
  // 렌더 단계 notFound()는 스트리밍 시작 후라 상태코드를 못 바꾸는 경우가 있어 메타에서 먼저 차단 (GSC Soft 404 243건 원인)
  if (!post) return { robots: { index: false, follow: false } }

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
    // 가입인사·참여이벤트 글은 검색엔진 색인 제외(내부 콘텐츠 — 목록/sitemap에서도 제외, 이벤트는 /events로 redirect)
    ...(post.category === GREETING_CATEGORY || post.category === EVENT_CATEGORY
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

  // 관련글 1회 조회 → 본문끝 추천(후보 24 → 클라 점수화 상위 3) + 하단 목록(slice 12) 공용
  // crossBoard: algo v2(A/B) 전용 크로스보드 후보. v1·하단 목록은 related(같은 보드)만 사용.
  const [related, crossBoard] = await Promise.all([
    getRelatedCommunityPosts(post.boardType, post.category || null, resolvedId, 24),
    getCrossBoardCandidates(post.boardType, post.category || null, resolvedId, 12),
  ])

  // 참여 이벤트 연동글은 공식 상세(/events)로 이관 — 사는이야기 게시글 상세로 노출하지 않는다.
  // 판정은 getPostDetail의 category(캐시 안정)만 사용. 대상 vote id 해석·HIDDEN 판정은 /events(force-dynamic)가 담당.
  // (force-static 페이지에서 직접 voteEvent 조회는 렌더 시 불안정 → category 기준으로만 redirect)
  if (post.category === EVENT_CATEGORY) permanentRedirect(`/events/${resolvedId}`)
  // ↑ 여기까지 통과하면 이벤트글이 아님 → 일반 사는이야기 글로 렌더(투표 레이아웃은 /events가 담당)

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
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-5 mb-4">
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
        className="post-content text-body text-foreground leading-[1.85] mb-5 break-keep [&_p]:mb-4 [&_img]:h-auto [&_img]:my-4 [&_img]:rounded-xl [&_img]:-mx-4 [&_img]:w-[calc(100%+2rem)] [&_img]:max-w-[calc(100%+2rem)] md:[&_img]:mx-0 md:[&_img]:w-full md:[&_img]:max-w-full [&_hr]:border-border [&_hr]:my-6 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:my-4 [&_video]:my-4 [&_video]:rounded-xl [&_video]:-mx-4 [&_video]:w-[calc(100%+2rem)] md:[&_video]:mx-0 md:[&_video]:w-full [&_.image-placeholder]:py-6 [&_.image-placeholder]:px-4 [&_.image-placeholder]:bg-muted [&_.image-placeholder]:rounded-xl [&_.image-placeholder]:text-center [&_.image-placeholder]:text-muted-foreground [&_.image-placeholder]:text-[17px] [&_.image-placeholder]:my-4"
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
        <NativeAdSlot slotId="community-detail-inarticle" minHeight={230} fallback={<AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />} />
      </div>

      {/* 관련글 추천 v2 — 본문 직후(광고① 다음, 댓글 전) "다음에 읽기 좋은 이야기".
          후보 전체(24)를 넘기고 클라에서 본 글 제외 + 맥락×흥미도 점수화 상위 3개 노출. 하단 PostListBottom 유지. */}
      <NextPostsInline
        postId={resolvedId}
        boardSlug={boardSlug}
        currentCategory={post.category || null}
        currentTitle={post.title}
        currentPreview={post.preview ?? ''}
        currentBoardType={post.boardType}
        posts={related}
        crossBoardPosts={crossBoard}
      />

      {/* 댓글 (광고/관련글 뒤) */}
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
      <NativeAdSlot slotId="community-detail-bottom" minHeight={230} fallback={<AdSenseUnit slotId={ADSENSE.POST_BOTTOM_BANNER} format="auto" className="rounded-2xl overflow-hidden mt-6" />} />
    </div>
  )
}
