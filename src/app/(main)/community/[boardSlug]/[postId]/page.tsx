import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBoardConfig } from '@/lib/queries/boards'
import { getPostDetail, getPostMeta } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import ActionBar from '@/components/features/community/ActionBar'
import PostDeleteButton from '@/components/features/community/PostDeleteButton'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml, proxyR2Images } from '@/lib/sanitize'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangSearchWidget from '@/components/ad/CoupangSearchWidget'
import CoupangBanner from '@/components/ad/CoupangBanner'
import PostListBottom from '@/components/features/community/PostListBottom'
import { ADSENSE } from '@/components/ad/ad-slots'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import PostViewBeacon from '@/components/common/PostViewBeacon'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
  searchParams: Promise<{ from?: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug, postId: rawPostId } = await params
  const postId = decodeURIComponent(rawPostId)
  const post = await getPostMeta(postId)
  if (!post) return {}

  // CUID로 접근 시 streaming 시작 전에 308 redirect
  if (post.slug && postId !== post.slug) {
    permanentRedirect(`/community/${boardSlug}/${post.slug}`)
  }

  const canonicalId = post.slug ?? postId
  const url = `${BASE_URL}/community/${boardSlug}/${canonicalId}`
  const description = post.summary || '50·60대가 나이 걱정 없이 소통하는 따뜻한 커뮤니티'

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
  }
}

async function CommentsLoader({ postId, userId, currentUser }: {
  postId: string
  userId?: string
  currentUser?: { id: string; nickname: string; grade: import('@/generated/prisma/client').Grade; profileImage: string | null }
}) {
  const comments = await getCommentsByPostId(postId, userId)
  return <CommentSection postId={postId} comments={comments} isLoggedIn={!!userId} currentUser={currentUser} />
}

export default async function PostDetailPage({ params, searchParams }: PageProps) {
  const [{ boardSlug, postId: rawPostId }, { from }] = await Promise.all([params, searchParams])
  const postId = decodeURIComponent(rawPostId)
  const isTrending = from === 'trending'

  // from 파라미터: PostCard가 진입 경로를 URL에 담아 전달. router.back() 대신
  // 하드링크를 사용하므로 외부 사이트(구글/카카오)로 이탈하지 않음.
  type BackSource = 'best' | 'trending'
  const BACK_CONFIG: Record<BackSource, { label: string; href: string }> = {
    best:     { label: '인기글', href: '/best' },
    trending: { label: '홈',    href: '/'     },
  }
  const source = (from && from in BACK_CONFIG) ? from as BackSource : undefined

  const [board, session, post] = await Promise.all([
    getBoardConfig(boardSlug),
    auth(),
    getPostDetail(postId),
  ])
  if (!board) notFound()
  if (!post) notFound()

  const backHref  = source ? BACK_CONFIG[source].href  : `/community/${boardSlug}`
  const backLabel = source ? BACK_CONFIG[source].label : board.displayName

  // CUID로 접근했는데 slug가 있으면 slug URL로 308 영구 redirect
  if (post.slug && postId !== post.slug) {
    permanentRedirect(`/community/${boardSlug}/${post.slug}`)
  }

  const userId = session?.user?.id
  // slug로 접근한 경우에도 DB의 실제 CUID를 사용 (comments/likes FK 보장)
  const resolvedId = post.id

  const [isLiked, isScrapped] = await Promise.all([
    userId
      ? prisma.like.findUnique({ where: { userId_postId: { userId, postId: resolvedId } }, select: { id: true } }).then(r => !!r)
      : Promise.resolve(false),
    userId
      ? prisma.scrap.findUnique({ where: { userId_postId: { userId, postId: resolvedId } }, select: { id: true } }).then(r => !!r)
      : Promise.resolve(false),
  ])

  const isOwnPost = !!userId && !!post.author.id && post.author.id === userId

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
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
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
        <Link href={backHref} className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5">
          ← {backLabel}
        </Link>
        {isOwnPost && (
          <div className="flex items-center gap-1">
            <Link
              href={`/community/${boardSlug}/${resolvedId}/edit`}
              className="text-xs text-muted-foreground min-h-[52px] px-3 py-1 rounded-lg hover:text-primary transition-colors no-underline flex items-center"
            >
              수정
            </Link>
            <PostDeleteButton postId={resolvedId} />
          </div>
        )}
      </div>

      {/* 게시글 헤더 */}
      <div className="mb-8 pb-6 border-b border-border">
        {post.category && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-foreground text-caption font-bold w-fit mb-2">{post.category}</span>
        )}
        <h1 className="text-xl font-bold text-foreground m-0 mb-4 leading-[1.4]">{post.title}</h1>
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <span>{post.author.gradeEmoji}</span>
          <span className="font-bold text-foreground">{post.author.nickname}</span>
          <span>·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          <span>·</span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="post-content text-body text-foreground leading-[1.85] mb-8 break-keep bg-card p-6 rounded-xl shadow-sm [&_p]:mb-4 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:my-4 [&_hr]:border-border [&_hr]:my-6 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:my-4 [&_video]:w-full [&_video]:rounded-xl [&_video]:my-4 [&_.image-placeholder]:py-6 [&_.image-placeholder]:px-4 [&_.image-placeholder]:bg-muted [&_.image-placeholder]:rounded-xl [&_.image-placeholder]:text-center [&_.image-placeholder]:text-muted-foreground [&_.image-placeholder]:text-[15px] [&_.image-placeholder]:my-4"
        dangerouslySetInnerHTML={{ __html: proxyR2Images(sanitizeHtml(post.content)) }}
      />

      {/* 광고 — 인아티클 */}
      <div className="mb-8">
        <AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />
      </div>

      {/* 액션 바 */}
      <ActionBar
        postId={resolvedId}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={isLiked}
        isScrapped={isScrapped}
        isLoggedIn={!!userId}
      />

      {/* 쿠팡 관련 상품 */}
      <div className="mb-8">
        <CoupangSearchWidget />
      </div>

      {/* 댓글 — Suspense로 지연 로딩 (본문 먼저 표시) */}
      <Suspense fallback={
        <div className="mb-12 space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse w-32" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
        </div>
      }>
        <CommentsLoader postId={resolvedId} userId={userId} currentUser={userId ? session?.user : undefined} />
      </Suspense>

      {/* 하단 연속 읽기 */}
      <CoupangBanner preset="mobile" className="my-6 rounded-2xl overflow-hidden" />
      <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/50 rounded-2xl" />}>
        <PostListBottom
          boardType={board.boardType}
          boardSlug={boardSlug}
          excludePostId={resolvedId}
          displayName={board.displayName}
          mode={isTrending ? 'trending' : 'latest'}
        />
      </Suspense>
    </div>
  )
}
