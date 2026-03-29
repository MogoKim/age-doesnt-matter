import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { getBoardConfig } from '@/lib/queries/boards'
import { getPostDetail } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import ActionBar from '@/components/features/community/ActionBar'
import PostDeleteButton from '@/components/features/community/PostDeleteButton'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml } from '@/lib/sanitize'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import CoupangCPS from '@/components/ad/CoupangCPS'
import CoupangSearchWidget from '@/components/ad/CoupangSearchWidget'
import { ADSENSE } from '@/components/ad/ad-slots'
import Breadcrumbs from '@/components/common/Breadcrumbs'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

const BASE_URL = 'https://age-doesnt-matter.com'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug, postId } = await params
  const post = await getPostDetail(postId)
  if (!post) return {}

  const url = `${BASE_URL}/community/${boardSlug}/${postId}`
  const description = post.preview || '50·60대가 나이 걱정 없이 소통하는 따뜻한 커뮤니티'

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
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
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

  const isOwnPost = !!userId && !!post.author.id && post.author.id === userId
  const comments = await getCommentsByPostId(postId, userId)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* Breadcrumbs + JSON-LD */}
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
              href={`/community/${boardSlug}/${postId}/edit`}
              className="text-xs text-muted-foreground min-h-[52px] px-3 py-1 rounded-lg hover:text-primary transition-colors no-underline flex items-center"
            >
              수정
            </Link>
            <PostDeleteButton postId={postId} />
          </div>
        )}
      </div>

      {/* 게시글 헤더 */}
      <div className="mb-8 pb-6 border-b border-border">
        {post.category && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-caption font-bold w-fit mb-2">{post.category}</span>
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
        className="post-content text-body text-foreground leading-[1.85] mb-8 break-keep bg-card p-6 rounded-xl shadow-sm [&_p]:mb-4 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-4 [&_hr]:border-border [&_hr]:my-6 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:my-4"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
      />

      {/* 액션 바 */}
      <ActionBar
        postId={postId}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={post.isLiked}
        isScrapped={post.isScrapped}
      />

      {/* 광고 — 인아티클 + 쿠팡 CPS + 섹션사이 + 검색위젯 */}
      <div className="mb-8 space-y-4">
        <AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />
        <CoupangCPS postId={postId} />
        <AdSenseUnit slotId={ADSENSE.SECTION_BETWEEN} format="auto" className="rounded-2xl overflow-hidden" />
        <CoupangSearchWidget />
      </div>

      {/* 댓글 */}
      <CommentSection postId={postId} comments={comments} />
    </div>
  )
}
