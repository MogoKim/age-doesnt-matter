import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
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
import { ADSENSE } from '@/components/ad/ad-slots'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

const BASE_URL = 'https://www.age-doesnt-matter.com'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug, postId } = await params
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

export default async function PostDetailPage({ params }: PageProps) {
  const { boardSlug, postId } = await params

  const [board, session] = await Promise.all([
    getBoardConfig(boardSlug),
    auth(),
  ])
  if (!board) notFound()

  const userId = session?.user?.id
  const post = await getPostDetail(postId, userId)
  if (!post) notFound()

  // CUID로 접근했는데 slug가 있으면 slug URL로 308 영구 redirect
  if (post.slug && postId !== post.slug) {
    permanentRedirect(`/community/${boardSlug}/${post.slug}`)
  }

  // slug로 접근한 경우에도 DB의 실제 CUID를 사용 (comments/likes FK 보장)
  const resolvedId = post.id
  const comments = await getCommentsByPostId(resolvedId, userId)

  const isOwnPost = !!userId && !!post.author.id && post.author.id === userId

  const canonicalSlug = post.slug ?? postId
  const url = `${BASE_URL}/community/${boardSlug}/${canonicalSlug}`
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: '홈', path: '/' },
    { name: board.displayName, path: `/community/${boardSlug}` },
    { name: post.title, path: `/community/${boardSlug}/${canonicalSlug}` },
  ])
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.preview || '50·60대가 나이 걱정 없이 소통하는 따뜻한 커뮤니티',
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
      {/* GA4 게시글 조회 이벤트 */}
      <GTMEventOnMount event="post_view" data={{ post_id: resolvedId, board_type: board.boardType, category: post.category ?? '' }} />
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
        <Link href={`/community/${boardSlug}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5">
          ← {board.displayName}
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
        isLiked={post.isLiked}
        isScrapped={post.isScrapped}
        isLoggedIn={!!userId}
      />

      {/* 쿠팡 관련 상품 */}
      <div className="mb-8">
        <CoupangSearchWidget />
      </div>

      {/* 댓글 */}
      <CommentSection postId={resolvedId} comments={comments} isLoggedIn={!!userId} />
    </div>
  )
}
