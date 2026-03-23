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

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { postId } = await params
  const post = await getPostDetail(postId)
  if (!post) return {}

  return {
    title: post.title,
    description: post.preview,
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

  const isOwnPost = !!userId && post.author.id === userId
  const comments = await getCommentsByPostId(postId, userId)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
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
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-bold w-fit mb-2">{post.category}</span>
        )}
        <h1 className="text-xl font-bold text-foreground m-0 mb-4 leading-[1.4]">{post.title}</h1>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
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
        className="text-base text-foreground leading-[1.85] mb-8 break-keep bg-card p-6 rounded-xl shadow-sm [&_p]:mb-4 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-4 [&_hr]:border-border [&_hr]:my-6 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:my-4"
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

      {/* 광고 슬롯 */}
      <div className="bg-[#F9F5F0] rounded-2xl px-4 py-8 text-center relative border border-dashed border-border text-muted-foreground text-xs mb-8">
        <span className="absolute top-2 left-2 text-[13px] text-muted-foreground bg-white/90 px-2 py-0.5 rounded-full font-medium">광고</span>
        광고 영역
      </div>

      {/* 댓글 */}
      <CommentSection postId={postId} comments={comments} />
    </div>
  )
}
